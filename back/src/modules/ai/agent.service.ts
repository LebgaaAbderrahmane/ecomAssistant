import type { Prisma } from '@prisma/client';
import prisma from '../../config/db.config';
import { callLLM } from './clients/llm.client';
import { parseResponse, parseReplyResponse, LLMParseError } from './parser/response.parser';
import { buildIntentPrompt, buildReplyPrompt, AgentContext, ReplyContext } from './prompts/promptBuilder';
import { IntentSchema, ReadToolNameSchema, WriteToolNameSchema, resolveTool, isSuggestedIntent, isReadTool, isWriteTool, intentToString, type IntentField } from './schemas/intents.schemas';
import { executeTool, ToolResult } from './tools/registry';
import { recordSuggestion, topSuggested } from './suggestedIntents.service';
import type { ConversationMemory, Flow } from './memory.types';
import { migrateMemory, getActiveFlow, createFlow } from './flowHelper';
import { persistFlowMemory, applyToolResult } from './flowProcessor';
import { resolveFlow, toFlowResolverEntities } from './flowResolver';
import type { IntentItem } from './schemas/ai.schemas';
import { INTENT_RESPONSE_SCHEMA, REPLY_RESPONSE_SCHEMA } from './schemas/gemini.schemas';
import { openwaService } from '../whatsapp/whatsapp.service';
import { enqueueLayer2Job } from '../../queues/layer2.queue';
import { decideLayer2JobKind } from './layer2JobKind';
import type { ImageCategory } from './media/imageCaption.service';
import { msgLogger } from '../../lib/logger';

const ALL_INTENTS = IntentSchema.options as readonly string[] as string[];
const ALL_TOOLS = [...ReadToolNameSchema.options, ...WriteToolNameSchema.options];

// Product intents whose tools resolve references from conversation memory.
// They are excluded from the "unresolved" short-circuit so the tool — not the
// intent extractor — decides NOT_FOUND vs AMBIGUOUS using memory + catalog.
const PRODUCT_INTENTS = new Set(['PRODUCT_SEARCH', 'PRODUCT_SELECT', 'PRODUCT_DETAILS', 'PRODUCT_SUGGEST']);

const DEFAULT_TEMPLATES: Record<string, string> = {
  orderConfirmation: [
    "Bonjour {clientName},",
    "",
    "Votre commande #{orderId} pour \"{productName}\" a bien été reçue.",
    "",
    "Montant: {totalAmount} DA",
    "Wilaya: {wilaya}",
    "",
    "Merci pour votre confiance !",
  ].join("\n"),
  cartFollowUp: [
    "Bonjour {clientName},",
    "",
    "J'ai remarqué que vous étiez intéressé par \"{productName}\". Avez-vous des questions ?",
  ].join("\n"),
  greeting: [
    "Bienvenue chez {shopName} ! 👋",
    "",
    "Comment puis-je vous aider ?",
  ].join("\n"),
};

// Hardcoded priority for safety-net sorting when LLM assigns wrong order.
const INTENT_PRIORITY: Record<string, number> = {
  PRODUCT_SEARCH: 1,
  PRODUCT_SELECT: 1,
  PRODUCT_DETAILS: 1,
  PRODUCT_SUGGEST: 1,
  ORDER_MODIFY: 2,
  SHIPPING_CHECK: 3,
  ORDER_CREATE: 4,
  ORDER_CONFIRM: 4,
  ORDER_CANCEL: 4,
  STATUS_CHECK: 5,
  ESCALATION: 5,
  OUT_OF_SCOPE: 5,
  GOODBYE: 5,
};

function intentPriority(intent: IntentField): number {
  return typeof intent === 'string' ? (INTENT_PRIORITY[intent] ?? 5) : 5;
}

async function resolveProductId(merchantId: string, productName: string): Promise<string | null> {
  const product = await prisma.product.findFirst({
    where: {
      merchantId,
      name: { contains: productName, mode: 'insensitive' },
    },
  });
  return product?.id ?? null;
}

/** Sort intents by LLM-assigned order, with hardcoded priority as tiebreaker. */
function sortIntents(intents: IntentItem[]): IntentItem[] {
  return [...intents].sort((a, b) => {
    const orderDiff = a.order - b.order;
    if (orderDiff !== 0) return orderDiff;
    // Tiebreak by hardcoded priority (lower = first)
    return intentPriority(a.intent) - intentPriority(b.intent);
  });
}

// ---------------------------------------------------------------------------
// Flow update helper
//
// After every tool execution, applies the result to the active flow via
// FlowProcessor.applyToolResult. Handles the data-shape normalization between
// what tools return ({ id, name, price }) and what FlowProduct expects
// ({ productId, productName, price, variants }).
// ---------------------------------------------------------------------------

function normalizeProductsForFlow(
  rawProducts: Array<{ id: string; name: string; price?: number }>,
): Array<{ productId: string; productName: string; price: number; variants: never[] }> {
  return rawProducts.map((p) => ({
    productId: p.id,
    productName: p.name,
    price: p.price ?? 0,
    variants: [] as never[],
  }));
}

/**
 * Applies a tool result to the active flow. If no active flow or tool result
 * is null, this is a no-op. Returns the (possibly new) flow reference so
 * callers can update memory/executionContext.
 */
function applyToolToFlow(
  flow: Flow | null,
  toolName: string,
  result: ToolResult | null,
): Flow | null {
  if (!flow || !result) return flow;

  // Build the data object that applyToolResult expects, normalizing shapes
  // where tool output differs from FlowProduct / OrderData schemas.
  let flowData: Record<string, unknown> | undefined;
  if (result.data) {
    flowData = { ...result.data };

    // Normalize product arrays: tools return { id, name, price }, FlowProduct
    // expects { productId, productName, price, variants }.
    if (flowData.products && Array.isArray(flowData.products)) {
      flowData.products = normalizeProductsForFlow(
        flowData.products as Array<{ id: string; name: string; price?: number }>,
      );
    }
  }

  return applyToolResult(flow, toolName as import('./schemas/intents.schemas').ToolName, result.success, flowData);
}

// ─── Image category routing ─────────────────────────────────────────────
// If the message is an image, route by category before LLM #1 sees it.
// The description is already in message.content from the captioning service.
function buildEffectiveText(message: {
  messageType: string;
  entities: Prisma.JsonValue | null;
  text: string;
}): string {
  let effectiveText = message.text;

  if (message.messageType === 'image') {
    const entities = (message.entities as Record<string, unknown>) ?? {};
    const category = entities.imageCategory as ImageCategory | undefined;
    const productName = entities.productName as string | null;

    if (category === 'PAYMENT_PROOF' || category === 'DAMAGE_COMPLAINT') {
      // Escalate directly — human agent can view the image in WhatsApp
      effectiveText = `[Image received: ${category === 'PAYMENT_PROOF' ? 'payment proof' : 'damage complaint'}] ${message.text}`;
    } else if (category === 'PRODUCT_PHOTO') {
      // Prepend image context so LLM #1 sees a rich query for PRODUCT_SEARCH
      const namePart = productName ? ` (product: ${productName})` : '';
      effectiveText = `[Customer sent a photo${namePart}] ${message.text}`;
    }
    // OTHER or uncategorized: fall through with effectiveText = message.text
  }

  return effectiveText;
}

// ─── Layer 2 types ───────────────────────────────────────────────────────
type ToolResultEntry = { intent: string; result: ToolResult | null };

type ToolExecutionOutcome = {
  toolResults: ToolResultEntry[];
  memory: ConversationMemory;
};

type Layer2ReplyState = {
  sortedIntents: IntentItem[];
  primaryIntent: IntentItem;
  conversationAct: string;
  tone: string;
  language: string;
  memory: ConversationMemory;
};

// ─── Layer 2, step 1: tool execution ────────────────────────────────────
// Runs the backend functions for the message's intents and returns the results
// plus the memory state the reply needs. `opts.only` restricts which tools run:
// during human takeover, write tools execute immediately while read tools are
// deferred and handled separately.
async function executeTools(
  messageId: string,
  sortedIntents: IntentItem[],
  opts: { only?: 'read' | 'write' } = {},
): Promise<ToolExecutionOutcome> {
  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { conversation: true },
  });
  const { conversation } = message;
  const memory = migrateMemory(conversation.memory);

  const log = msgLogger({ conversationId: conversation.id, messageId });

  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: conversation.customerId },
  });

  const activeFlow = getActiveFlow(memory) ?? null;
  const executionContext = {
    merchantId: conversation.merchantId,
    customerId: conversation.customerId,
    conversationId: conversation.id,
    activeFlow,
    customerWilaya: customer.wilaya,
    customerCommune: customer.commune,
  };

  const intents = opts.only
    ? sortedIntents.filter((item) => {
        const toolName = resolveTool(item.intent, item.entities);
        if (!toolName) return false;
        return opts.only === 'read' ? isReadTool(toolName) : isWriteTool(toolName);
      })
    : sortedIntents;

  // ─── Entity enrichment + tool execution loop ─────────────────────────
  const toolResults: ToolResultEntry[] = [];
  const toolResultCache = new Map<string, ToolResult | null>();
  // Whether an exact product request (search/recall) succeeded this message.
  // When true, paired suggestions are skipped — a search that matched what the
  // customer asked needs no recommendation on top.
  let searchSucceededThisMessage = false;
  // suggestProducts intents are executed after the main loop so the outcome of
  // a paired PRODUCT_SEARCH is already known before deciding to recommend.
  const deferredSuggestions: Array<{
    item: IntentItem;
    entities: Record<string, string | number | boolean | null>;
    toolKey: string;
  }> = [];

  for (const item of intents) {
    // Product intents are never short-circuited on "unresolved": their tools
    // (searchProducts / chooseProduct / getProductDetails / suggestProducts)
    // resolve the reference from conversation memory first and only report
    // AMBIGUOUS when neither the message nor the memory can identify a product.
    // Other intents that the LLM could not act on are recorded as AMBIGUOUS and skipped.
    if (item.status === 'unresolved' && !PRODUCT_INTENTS.has(intentToString(item.intent))) {
      toolResults.push({
        intent: intentToString(item.intent),
        result: {
          success: false,
          outcome: 'AMBIGUOUS',
          error: item.unresolvedReason ?? 'The request is too vague to act on. Ask the customer to clarify what they mean.',
        },
      });
      continue;
    }

    // Resolve tool from intent
    const toolName = resolveTool(item.intent, item.entities);
    if (!toolName) {
      toolResults.push({ intent: intentToString(item.intent), result: null });
      continue;
    }

    // Enrich productId from product name (for intents that have a product entity)
    const entities = { ...item.entities };
    if (entities.product && !entities.productId) {
      const resolvedId = await resolveProductId(conversation.merchantId, entities.product as string);
      if (resolvedId) {
        entities.productId = resolvedId;
        log.info({ productId: resolvedId, productName: entities.product }, 'resolved productId from name');
      }
    }

    // Dedupe identical tool calls within one message (e.g. LLM #1 emitting the
    // same PRODUCT_SEARCH twice) — never burn a second DB/LLM call on it.
    const toolKey = `${toolName}:${JSON.stringify(entities)}`;

    // Suggestions run last, after every other intent (see below).
    if (toolName === 'suggestProducts') {
      deferredSuggestions.push({ item, entities, toolKey });
      continue;
    }

    if (toolResultCache.has(toolKey)) {
      const cached = toolResultCache.get(toolKey) ?? null;
      toolResults.push({ intent: intentToString(item.intent), result: cached });
      continue;
    }

    // Execute tool with per-intent error handling
    let result: ToolResult;
    try {
      log.info(
        {
          tool: toolName,
          intent: intentToString(item.intent),
          entities,
          activeFlowId: executionContext.activeFlow?.flowId.slice(0, 8) ?? null,
          activeFlowState: executionContext.activeFlow?.state ?? null,
        },
        'tool: executing',
      );
      result = await executeTool(toolName, entities, executionContext);
      const productCount = Array.isArray(result.data?.products) ? (result.data.products as unknown[]).length : undefined;
      log.info(
        {
          tool: toolName,
          intent: intentToString(item.intent),
          outcome: result.outcome ?? (result.success ? 'SUCCESS' : 'FAIL'),
          productCount,
          error: result.error,
          data: productCount !== undefined ? undefined : result.data,
        },
        'tool: executed',
      );
    } catch (err) {
      log.error({ tool: toolName, intent: intentToString(item.intent), err }, 'tool: threw');
      result = { success: false, error: 'Tool execution failed' };
    }
    toolResultCache.set(toolKey, result);

    toolResults.push({ intent: intentToString(item.intent), result });

    // Apply tool result to active flow (state transitions + data recording).
    if (executionContext.activeFlow && result) {
      const updated = applyToolToFlow(executionContext.activeFlow, toolName, result);
      if (updated && updated !== executionContext.activeFlow) {
        log.info(
          {
            tool: toolName,
            from: executionContext.activeFlow.state,
            to: updated.state,
            flowId: updated.flowId.slice(0, 8),
          },
          'flow: state transition from tool',
        );
        executionContext.activeFlow = updated;
        const idx = memory.flows.findIndex((f) => f.flowId === updated.flowId);
        if (idx >= 0) memory.flows[idx] = updated;
      }
    }

    // Store search results on message entities for backward compatibility.
    if (
      (toolName === 'searchProducts' || toolName === 'recallPreviousProducts') &&
      result.success &&
      result.data?.products &&
      Array.isArray(result.data.products)
    ) {
      const productsArray = result.data.products as Array<{ id: string; name: string; price?: number }>;
      const productsList = productsArray.map((p) => ({ id: p.id, name: p.name }));

      await prisma.message.update({
        where: { id: messageId },
        data: {
          entities: {
            ...(entities as Record<string, unknown>),
            products: productsList,
          } as Prisma.InputJsonValue,
        },
      });

      searchSucceededThisMessage = true;
      log.info({ count: productsList.length }, 'stored products in message entities');
    }
  }

  // ─── Deferred suggestions ────────────────────────────────────────────
  // Run PRODUCT_SUGGEST after every other intent so a paired search's outcome
  // is known. If the exact search already returned results, skip the
  // recommendation — never suggest merely because a search succeeded.
  for (const { item, entities, toolKey } of deferredSuggestions) {
    if (searchSucceededThisMessage) {
      toolResults.push({ intent: intentToString(item.intent), result: null });
      continue;
    }

    let result: ToolResult;
    if (toolResultCache.has(toolKey)) {
      result = toolResultCache.get(toolKey) as ToolResult;
    } else {
      try {
        result = await executeTool('suggestProducts', entities, executionContext);
        const sugCount = Array.isArray(result.data?.products) ? (result.data.products as unknown[]).length : undefined;
        log.info(
          {
            tool: 'suggestProducts',
            intent: intentToString(item.intent),
            outcome: result.outcome ?? (result.success ? 'SUCCESS' : 'FAIL'),
            productCount: sugCount,
            error: result.error,
          },
          'tool executed',
        );
      } catch (err) {
        log.error({ tool: 'suggestProducts', intent: intentToString(item.intent), err }, 'tool failed');
        result = { success: false, error: 'Tool execution failed' };
      }
      toolResultCache.set(toolKey, result);
    }

    toolResults.push({ intent: intentToString(item.intent), result });

    // Apply tool result to active flow.
    if (executionContext.activeFlow && result) {
      const updated = applyToolToFlow(executionContext.activeFlow, 'suggestProducts', result);
      if (updated && updated !== executionContext.activeFlow) {
        executionContext.activeFlow = updated;
        const idx = memory.flows.findIndex((f) => f.flowId === updated.flowId);
        if (idx >= 0) memory.flows[idx] = updated;
      }
    }

    // Store suggested products on message entities for backward compatibility.
    if (result.success && result.data?.products && Array.isArray(result.data.products)) {
      const productsArray = result.data.products as Array<{ id: string; name: string; price?: number }>;
      const productsList = productsArray.map((p) => ({ id: p.id, name: p.name }));

      await prisma.message.update({
        where: { id: messageId },
        data: {
          entities: {
            ...(entities as Record<string, unknown>),
            products: productsList,
          } as Prisma.InputJsonValue,
        },
      });

      log.info({ count: productsList.length }, 'stored suggested products in message entities');
    }
  }

  return { toolResults, memory };
}

// ─── Layer 2, step 2: reply generation ───────────────────────────────────
// Builds the reply from the executed tool results: LLM #2 → persist messages
// → send via WhatsApp → update memory. Only called when the AI owns the
// conversation (inline path) or after de-escalation (deferred path).
async function generateResponse(
  messageId: string,
  toolResults: ToolResultEntry[],
  state: Layer2ReplyState,
): Promise<void> {
  const {
    sortedIntents,
    primaryIntent,
    conversationAct,
    tone,
    language,
    memory,
  } = state;

  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { conversation: true },
  });
  const { conversation } = message;
  const log = msgLogger({ conversationId: conversation.id, messageId });
  const effectiveText = buildEffectiveText(message);
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: conversation.customerId },
  });

  // ─── LLM #2: reply generation (single call for all intents) ─────────
  const replyContext: ReplyContext = {
    intents: sortedIntents.map(item => ({
      intent: intentToString(item.intent),
      entities: item.entities,
      status: item.status,
      candidates: item.candidates,
    })),
    conversationAct,
    toolResults,
    memory,
    tone,
    language,
  };

  const rawReply = await callLLM({
    systemPrompt: buildReplyPrompt(replyContext),
    userMessage: effectiveText,
    responseSchema: REPLY_RESPONSE_SCHEMA,
  });

  let replyParsed;
  try {
    replyParsed = parseReplyResponse(rawReply);
  } catch (err) {
    if (err instanceof LLMParseError) {
      log.error({ raw: err.raw }, 'failed to parse reply response');
    }
    throw err;
  }

  // Persist each reply message as a separate DB row
  for (const text of replyParsed.messages) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUT',
        sender: 'AI',
        content: text,
        text,
        role: 'assistant',
      },
    });
  }

  // ─── Send reply via WhatsApp (sequential with typing indicators) ─────
  try {
    const waSession = await prisma.whatsAppSession.findUnique({
      where: { merchantId: conversation.merchantId },
    });
    if (waSession && (waSession.status === 'connected' || waSession.status === 'ready')) {
      if (customer?.phone) {
        await openwaService.sendMessagesSequentially(
          waSession.sessionId,
          customer.phone,
          replyParsed.messages,
        );
        log.info({ to: customer.phone, count: replyParsed.messages.length }, 'reply sent via WhatsApp');
      } else {
        log.warn({ customerId: conversation.customerId }, 'no phone found for customer, reply not sent');
      }
    } else {
      log.warn({ merchantId: conversation.merchantId }, 'WhatsApp not connected, reply not sent');
    }
  } catch (err) {
    log.error({ err }, 'failed to send reply via WhatsApp');
  }

  // ─── Update conversation memory ─────────────────────────────────────
  await persistFlowMemory(conversation.id, memory);

  log.info(
    { intents: sortedIntents.map(i => intentToString(i.intent)), replyCount: replyParsed.messages.length },
    'pipeline completed',
  );
}

export const processMessage = async (messageId: string) => {
  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { conversation: true },
  });
  const { conversation } = message;
  const memory = migrateMemory(conversation.memory);

  const log = msgLogger({ conversationId: conversation.id, messageId });

  log.info(
    {
      text: message.text?.slice(0, 200),
      messageType: message.messageType,
      direction: message.direction,
      conversationState: conversation.state,
      takenOver: conversation.takenOverByHuman,
      flowCount: memory.flows.length,
      activeFlowId: memory.activeFlow ?? null,
      flowSummaries: memory.flows.map((f) => ({
        flowId: f.flowId.slice(0, 8),
        state: f.state,
        product: 'productDiscovery' in f ? f.productDiscovery.input.productName : null,
      })),
    },
    'processMessage: received',
  );

  // Was the human already in control when this message arrived? Read before any
  // processing: the deferred path applies only to pre-existing takeover, not to
  // escalations triggered by this very message.
  const wasTakenOver = conversation.takenOverByHuman;

  // Last thing the assistant said before this message. LLM #1 needs it to
  // interpret short follow-ups ("okay", "yes", "this one") relative to what
  // the assistant actually did last — e.g. present search results — instead of
  // reading them off the raw conversation state (which may be a stale
  // WAITING_CONFIRMATION from an earlier order that was never confirmed).
  const lastAssistantMessage = await prisma.message.findFirst({
    where: { conversationId: conversation.id, direction: 'OUT', id: { not: messageId } },
    orderBy: { createdAt: 'desc' },
    select: { text: true },
  });

  // --- Load AgentConfig ---
  const agentConfig = await prisma.agentConfig.findUnique({
    where: { merchantId: conversation.merchantId },
  });

  const tone = agentConfig?.tone ?? 'friendly';
  const defaultLanguage = agentConfig?.defaultLanguage ?? 'auto';
  const escalationThreshold = agentConfig?.escalationThreshold ?? 3;

  // --- LLM #1: intent extraction ---
  // Fetch customer record for delivery info and WhatsApp sending
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: conversation.customerId },
  });

  // ─── Image category routing ─────────────────────────────────────────
  // If the message is an image, route by category before LLM #1 sees it.
  // The description is already in message.content from the captioning service.
  const effectiveText = buildEffectiveText(message);

  // ─── Empty message guard ────────────────────────────────────────────
  // No transcribable content (e.g. media omitted by the gateway). Skip the LLM
  // pipeline entirely — never let empty input hallucinate an intent like
  // ORDER_CONFIRM. If a human owns the conversation, stay silent entirely.
  if (!effectiveText || !effectiveText.trim()) {
    if (conversation.takenOverByHuman) {
      log.info('empty message in human-owned conversation, ignored');
      return;
    }

    const fallbackReply = "Désolé, je n'ai pas bien compris votre message. Pouvez-vous réessayer par texte ou me l'envoyer à nouveau ?";
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUT',
        sender: 'AI',
        content: fallbackReply,
        text: fallbackReply,
        role: 'assistant',
      },
    });

    const waSession = await prisma.whatsAppSession.findUnique({
      where: { merchantId: conversation.merchantId },
    });
    if (waSession && (waSession.status === 'connected' || waSession.status === 'ready') && customer?.phone) {
      try {
        await openwaService.sendText(waSession.sessionId, customer.phone, fallbackReply);
      } catch (err) {
        log.error({ err }, 'failed to send fallback reply');
      }
    }

    await persistFlowMemory(conversation.id, memory);
    log.info('empty message, replied with clarifying fallback');
    return;
  }

  // ─── LLM #1: multi-intent extraction (always runs, even if taken over) ─
  // LLM #1 keeps working so we keep collecting intent data + suggested intents.
  const knownSuggestedIntents = await topSuggested(10);
  const intentContext: AgentContext = {
    state: conversation.state,
    allowedIntents: ALL_INTENTS,
    allowedTools: ALL_TOOLS,
    memory,
    knownSuggestedIntents,
    lastAssistantMessage: lastAssistantMessage?.text ?? null,
  };
  const rawIntent = await callLLM({
    systemPrompt: buildIntentPrompt(intentContext),
    userMessage: effectiveText,
    responseSchema: INTENT_RESPONSE_SCHEMA,
  });

  let parsed;
  try {
    parsed = parseResponse(rawIntent);
    log.info({ intentCount: parsed.intents.length, intents: parsed.intents.map(i => `${intentToString(i.intent)}(${i.confidence.toFixed(2)})`) }, 'extracted intents');
  } catch (err) {
    if (err instanceof LLMParseError) {
      log.error({ raw: err.raw }, 'failed to parse intent response');
    }
    throw err;
  }

  // Sort intents by logical execution order (LLM order + safety-net priority)
  const sortedIntents = sortIntents(parsed.intents);

  // Log when safety net overrides LLM order (useful for prompt tuning)
  for (let i = 0; i < sortedIntents.length; i++) {
    const item = sortedIntents[i];
    const expectedPriority = intentPriority(item.intent);
    if (item.order !== i + 1) {
      log.info({ intent: intentToString(item.intent), originalOrder: item.order, newPosition: i + 1, priority: expectedPriority }, 'safety-net order override');
    }
  }

  // Save primary intent to message record (backward compat)
  const primaryIntent = sortedIntents[0];

  log.info(
    {
      primaryIntent: intentToString(primaryIntent.intent),
      primaryEntities: primaryIntent.entities,
      conversationAct: parsed.conversationAct,
      allIntents: sortedIntents.map((i) => ({
        intent: intentToString(i.intent),
        entities: i.entities,
        confidence: i.confidence,
        status: i.status,
        order: i.order,
      })),
    },
    'intent details',
  );

  await prisma.message.update({
    where: { id: messageId },
    data: {
      intent: intentToString(primaryIntent.intent),
      entities: primaryIntent.entities,
      confidence: primaryIntent.confidence,
      parsedIntents: sortedIntents as unknown as Prisma.InputJsonValue,
      refersToPreviousFlow: parsed.refersToPreviousFlow,
    },
  });

  // ─── Flow resolution (primary intent) ──────────────────────────────────
  // Determines which flow this message continues, creates, or switches to.
  // Runs after intent extraction but before tool execution so the execution
  // context always has the correct activeFlow.
  const resolverEntities = toFlowResolverEntities(primaryIntent.entities);
  log.info(
    {
      intent: intentToString(primaryIntent.intent),
      resolverEntities,
      activeFlowId: memory.activeFlow ?? null,
      flowCount: memory.flows.length,
    },
    'flow resolution: input',
  );

  const resolverResult = resolveFlow({
    extraction: {
      intent: primaryIntent.intent,
      entities: resolverEntities,
      confidence: primaryIntent.confidence,
    },
    conversation: {
      activeFlowId: memory.activeFlow ?? null,
      flows: memory.flows,
    },
    refersToPreviousFlow: parsed.refersToPreviousFlow,
  });

  log.info(
    {
      action: resolverResult.action,
      intent: intentToString(primaryIntent.intent),
      ...(resolverResult.action === 'CREATE' && { productName: resolverResult.productName }),
      ...(resolverResult.action === 'CONTINUE' && { flowId: resolverResult.flowId }),
      ...(resolverResult.action === 'SWITCH' && { flowId: resolverResult.flowId }),
      ...(resolverResult.action === 'INVALID_ACTION' && { reason: resolverResult.reason }),
      ...(resolverResult.action === 'CLARIFY' && { candidates: resolverResult.candidates.map(c => ({ flowId: c.flowId.slice(0, 8), score: c.score, signals: c.matchedSignals, summary: c.summary })) }),
    },
    'flow resolution: result',
  );

  switch (resolverResult.action) {
    case 'CREATE': {
      const newFlow = createFlow({
        productName: resolverResult.productName,
        filters: resolverResult.filters,
      });
      memory.flows.push(newFlow);
      memory.activeFlow = newFlow.flowId;
      log.info({ flowId: newFlow.flowId, productName: resolverResult.productName, totalFlows: memory.flows.length }, 'flow resolution: created new flow');
      break;
    }
    case 'CONTINUE':
    case 'SWITCH':
      memory.activeFlow = resolverResult.flowId;
      log.info({ flowId: resolverResult.flowId, action: resolverResult.action }, 'flow resolution: switched/continued active flow');
      break;
    case 'INVALID_ACTION':
      log.info(
        { intent: intentToString(primaryIntent.intent), reason: resolverResult.reason },
        'flow resolution: invalid action, intent may not execute',
      );
      break;
    case 'CLARIFY':
      log.info(
        { candidates: resolverResult.candidates.map(c => ({ flowId: c.flowId.slice(0, 8), score: c.score, summary: c.summary })) },
        'flow resolution: ambiguous, multiple flows match equally',
      );
      break;
    case 'NO_FLOW_LOOKUP':
      break;
  }

  // Persist flow resolution changes (new flows, updated activeFlow) before tool
  // execution so the deferred path (which re-reads from DB) sees the correct state.
  await persistFlowMemory(conversation.id, memory);

  const executionContext = {
    merchantId: conversation.merchantId,
    customerId: conversation.customerId,
    conversationId: conversation.id,
    activeFlow: getActiveFlow(memory) ?? null,
    customerWilaya: customer.wilaya,
    customerCommune: customer.commune,
  };

  log.info(
    {
      activeFlowId: executionContext.activeFlow?.flowId.slice(0, 8) ?? null,
      activeFlowState: executionContext.activeFlow?.state ?? null,
      activeFlowProduct: executionContext.activeFlow && 'productDiscovery' in executionContext.activeFlow
        ? executionContext.activeFlow.productDiscovery.input.productName
        : null,
    },
    'execution context',
  );

  // ─── Suggested intents: record + escalate ───────────────────────────
  // When the LLM proposes a new intent, we persist it (count +1) and hand the
  // conversation over to a human. The AI then stops: no tools, no reply.
  const suggestedItems = sortedIntents.filter(item => isSuggestedIntent(item.intent));
  let takenOver = conversation.takenOverByHuman;

  if (suggestedItems.length > 0) {
    const seen = new Set<string>();
    for (const item of suggestedItems) {
      if (!isSuggestedIntent(item.intent)) continue;
      const suggested = item.intent; // narrowed to SuggestedIntentField
      if (seen.has(suggested.name)) continue;
      seen.add(suggested.name);
      try {
        await recordSuggestion(suggested.name, suggested.description);
        log.info({ name: suggested.name }, 'recorded suggested intent');
      } catch (err) {
        log.error({ name: suggested.name, err }, 'failed to record suggested intent');
      }
    }

    if (!takenOver) {
      const result = await executeTool('escalateConversation', {}, executionContext);
      log.info({ outcome: result.outcome ?? (result.success ? 'SUCCESS' : 'FAIL') }, 'escalated conversation (suggested intent)');
      takenOver = true;
    }

    // A suggested intent hands the conversation to a human immediately — no
    // tools, no reply, no deferral. The merchant picks it up from the dashboard.
    return;
  }

  // ─── Escalation threshold (existing safety net) ─────────────────────
  if (!takenOver) {
    const recentIntents = (memory.recentIntents ?? []) as string[];
    const updatedRecentIntents = [...recentIntents, `${intentToString(primaryIntent.intent)}:${parsed.conversationAct}`].slice(-10);

    if (parsed.conversationAct === 'DIDNT_UNDERSTAND' || parsed.conversationAct === 'FRUSTRATED') {
      const consecutiveNegative = updatedRecentIntents
        .slice()
        .reverse()
        .filter((e) => e.endsWith(':DIDNT_UNDERSTAND') || e.endsWith(':FRUSTRATED'))
        .length;

      if (consecutiveNegative >= escalationThreshold) {
        log.info({ consecutiveNegative, threshold: escalationThreshold }, 'escalation threshold reached, escalating');
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            takenOverByHuman: true,
            escalatedAt: new Date(),
          },
        });
        takenOver = true;

        // Send escalation notification to merchant
        try {
          const customer = await prisma.customer.findUnique({
            where: { id: conversation.customerId },
          });
          await prisma.notification.create({
            data: {
              merchantId: conversation.merchantId,
              type: 'escalation',
              title: 'Conversation escaladée',
              message: `Le client ${customer?.name || customer?.phone || 'inconnu'} a été transféré à un humain. ${consecutiveNegative} messages sans réponse satisfaisante.`,
              link: '/dashboard/escalations',
            },
          });
        } catch (err) {
          log.error({ err }, 'failed to create escalation notification');
        }
      }
    }
  }

  // ─── Layer 2: dispatch ────────────────────────────────────────────────
  // wasTakenOver → the human already owned the conversation when this message
  // arrived. Write tools execute immediately; their results + the parsed
  // intents are persisted, and read tools + the reply are deferred to the
  // agent-layer2 queue (which de-escalates before generating).
  if (wasTakenOver) {
    const outcome = await executeTools(messageId, sortedIntents, { only: 'write' });

    await prisma.message.update({
      where: { id: messageId },
      data: {
        toolResults: outcome.toolResults as unknown as Prisma.InputJsonValue,
      },
    });

    const kind = decideLayer2JobKind(sortedIntents);
    await enqueueLayer2Job(message.id, conversation.id, kind);
    log.info({ kind }, 'deferred layer-2');
    return;
  }

  // Escalated by this message itself (threshold safety net): write tools still
  // run, but the AI stays silent — the merchant now owns the conversation.
  if (takenOver) {
    await executeTools(messageId, sortedIntents, { only: 'write' });
    return;
  }

  // AI owns the conversation: full inline pipeline.
  const outcome = await executeTools(messageId, sortedIntents);

  await generateResponse(messageId, outcome.toolResults, {
    sortedIntents,
    primaryIntent,
    conversationAct: parsed.conversationAct,
    tone,
    language: defaultLanguage,
    memory: outcome.memory,
  });
};

// ─── Deferred Layer 2 (after human takeover) ─────────────────────────────
// Runs when a message that arrived under human takeover is processed after the
// fact. The write tools already ran during the takeover (their results are
// stored on the message); here the conversation is handed back to the AI, the
// deferred read tools execute, and the final reply is generated from the merged
// results.
export const processDeferredLayer2 = async (messageId: string) => {
  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { conversation: true },
  });
  const { conversation } = message;
  const memory = migrateMemory(conversation.memory);

  const log = msgLogger({ conversationId: conversation.id, messageId });

  log.info(
    {
      conversationState: conversation.state,
      flowCount: memory.flows.length,
      activeFlowId: memory.activeFlow ?? null,
    },
    'processDeferredLayer2: received',
  );

  const parsedIntents = (message.parsedIntents as unknown as IntentItem[] | null) ?? [];
  if (parsedIntents.length === 0) {
    log.info('no parsedIntents to process, nothing deferred');
    return;
  }

  const sortedIntents = sortIntents(parsedIntents);
  const primaryIntent = sortedIntents[0];

  log.info(
    {
      primaryIntent: intentToString(primaryIntent.intent),
      primaryEntities: primaryIntent.entities,
      allIntents: sortedIntents.map(i => intentToString(i.intent)),
    },
    'processDeferredLayer2: intent details',
  );

  // ─── Flow resolution (primary intent) ──────────────────────────────────
  // Re-resolve so the active flow is correct before read tools execute.
  // This mirrors the resolution step in processMessage — the deferred path
  // runs after the original flow resolution was already persisted (by the
  // main pipeline), but memory may have changed since (merchant messages,
  // other deferred jobs), so re-resolve is safer.
  const resolverResult = resolveFlow({
    extraction: {
      intent: primaryIntent.intent,
      entities: toFlowResolverEntities(primaryIntent.entities),
      confidence: primaryIntent.confidence,
    },
    conversation: {
      activeFlowId: memory.activeFlow ?? null,
      flows: memory.flows,
    },
    refersToPreviousFlow: message.refersToPreviousFlow,
  });

  log.debug(
    { action: resolverResult.action, intent: intentToString(primaryIntent.intent) },
    'flow resolution (deferred)',
  );

  switch (resolverResult.action) {
    case 'CREATE': {
      const newFlow = createFlow({
        productName: resolverResult.productName,
        filters: resolverResult.filters,
      });
      memory.flows.push(newFlow);
      memory.activeFlow = newFlow.flowId;
      log.debug({ flowId: newFlow.flowId, productName: resolverResult.productName }, 'created new flow (deferred)');
      break;
    }
    case 'CONTINUE':
    case 'SWITCH':
      memory.activeFlow = resolverResult.flowId;
      break;
    case 'INVALID_ACTION':
      log.info(
        { intent: intentToString(primaryIntent.intent), reason: resolverResult.reason },
        'flow resolution: invalid action (deferred)',
      );
      break;
    case 'CLARIFY':
      log.info(
        { candidates: resolverResult.candidates.map(c => c.flowId) },
        'flow resolution: ambiguous (deferred)',
      );
      break;
    case 'NO_FLOW_LOOKUP':
      break;
  }

  // Persist flow resolution before tool execution so executeTools (which
  // re-reads from DB) sees the correct activeFlow.
  await persistFlowMemory(conversation.id, memory);

  // ─── Conversation hand-back ─────────────────────────────────────────────
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { takenOverByHuman: false, escalatedAt: null },
  });

  const agentConfig = await prisma.agentConfig.findUnique({
    where: { merchantId: conversation.merchantId },
  });
  const tone = agentConfig?.tone ?? 'friendly';
  const language = agentConfig?.defaultLanguage ?? 'auto';

  // Deferred read tools — write tools already ran while the human owned the
  // conversation and their results are persisted on the message.
  const outcome = await executeTools(messageId, sortedIntents, { only: 'read' });

  // Merge the write-tool results stored at execution time with the reads just
  // executed. Read tools were excluded from the write-only pass, so no intent
  // appears twice.
  const storedToolResults = (message.toolResults as unknown as ToolResultEntry[] | null) ?? [];
  const toolResults = [...storedToolResults, ...outcome.toolResults];

  await generateResponse(messageId, toolResults, {
    sortedIntents,
    primaryIntent,
    conversationAct: 'ANSWER',
    tone,
    language,
    memory: outcome.memory,
  });
};
