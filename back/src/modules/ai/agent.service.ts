import type { Prisma } from '@prisma/client';
import prisma from '../../config/db.config';
import { callLLM } from './clients/llm.client';
import { parseResponse, parseReplyResponse, LLMParseError } from './parser/response.parser';
import { buildIntentPrompt, buildReplyPrompt, AgentContext, ReplyContext } from './prompts/promptBuilder';
import { IntentSchema, ReadToolNameSchema, WriteToolNameSchema, resolveTool, isSuggestedIntent, isReadTool, isWriteTool, intentToString, type IntentField } from './schemas/intents.schemas';
import { executeTool, ToolResult } from './tools/registry';
import { recordSuggestion, topSuggested } from './suggestedIntents.service';
import type { ConversationMemory, IntentSummary } from './memory.types';
import type { IntentItem } from './schemas/ai.schemas';
import { INTENT_RESPONSE_SCHEMA, REPLY_RESPONSE_SCHEMA } from './schemas/gemini.schemas';
import { openwaService } from '../whatsapp/whatsapp.service';
import { enqueueLayer2Job } from '../../queues/layer2.queue';
import { decideLayer2JobKind } from './layer2JobKind';
import type { ImageCategory } from './media/imageCaption.service';

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

async function persistMemory(
  conversationId: string,
  memory: ConversationMemory,
  sortedIntents: IntentItem[],
  primaryIntent: IntentItem,
  conversationAct: string,
  lastProductResults?: ConversationMemory['lastProductResults'],
  rejectedToRecord?: ConversationMemory['rejectedProducts'],
) {
  const intentSummaries: IntentSummary[] = sortedIntents.map(item => ({
    intent: intentToString(item.intent),
    entities: item.entities,
  }));

  const updatedMemory: ConversationMemory = {
    ...memory,
    lastIntent: intentToString(primaryIntent.intent),
    lastIntents: intentSummaries,
    lastConversationAct: conversationAct,
    entities: { ...(memory.entities ?? {}), ...primaryIntent.entities },
    lastProductResults: lastProductResults ?? memory.lastProductResults,
    updatedAt: new Date().toISOString(),
  };

  // A NEGATE message appends the products it is rejecting to the persistent
  // rejected list, so suggestProducts never offers them again. Only the
  // previously presented products are recorded — never a freshly suggested set.
  if (rejectedToRecord?.length) {
    const seen = new Set((updatedMemory.rejectedProducts ?? []).map((p) => p.id));
    for (const entry of rejectedToRecord) {
      if (entry?.id && !seen.has(entry.id)) {
        seen.add(entry.id);
        updatedMemory.rejectedProducts = [
          ...(updatedMemory.rejectedProducts ?? []),
          { id: entry.id, name: entry.name ?? '' },
        ];
      }
    }
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      memory: updatedMemory as Prisma.InputJsonValue,
      lastMessageAt: new Date(),
    },
  });
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
  replyMemory: ConversationMemory;
  finalLastProductResults: ConversationMemory['lastProductResults'];
};

type Layer2ReplyState = {
  sortedIntents: IntentItem[];
  primaryIntent: IntentItem;
  conversationAct: string;
  rejectedToRecord?: ConversationMemory['rejectedProducts'];
  tone: string;
  language: string;
  replyMemory: ConversationMemory;
  finalLastProductResults: ConversationMemory['lastProductResults'];
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
  const memory = (conversation.memory as ConversationMemory | null) ?? {};

  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: conversation.customerId },
  });

  const executionContext = {
    merchantId: conversation.merchantId,
    customerId: conversation.customerId,
    conversationId: conversation.id,
    currentOrderId: conversation.currentOrderId,
    currentProductId: conversation.currentProductId ?? null,
    lastProductResults: memory.lastProductResults,
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
  let lastProductResults = memory.lastProductResults;
  // A product search that definitively found nothing (or was too vague to run)
  // invalidates any previously stored results — the reply and any PRODUCT_SELECT
  // must not reference stale products from an unrelated earlier search.
  let productSearchMissed = false;
  // Fresh search/suggestion results stored this message protect against the
  // miss-clear above: a suggestion that ran after a failed search must keep
  // its own results in memory for follow-up selection.
  let resultsStoredThisMessage = false;
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
        console.log(`[agent] ${messageId} -> resolved productId "${resolvedId}" for product "${entities.product}"`);
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
      result = await executeTool(toolName, entities, executionContext);
      console.log(`[agent] tool "${toolName}" (intent=${intentToString(item.intent)}) ->`, result);
    } catch (err) {
      console.error(`[agent] tool "${toolName}" failed for intent ${intentToString(item.intent)}`, err);
      result = { success: false, error: 'Tool execution failed' };
    }
    toolResultCache.set(toolKey, result);

    // A product search that came back empty or too vague must not leave stale
    // results behind — and must not trigger any further search for the same item.
    if (
      (toolName === 'searchProducts' || toolName === 'recallPreviousProducts') &&
      (result.outcome === 'NOT_FOUND' || result.outcome === 'AMBIGUOUS')
    ) {
      productSearchMissed = true;
    }

    toolResults.push({ intent: intentToString(item.intent), result });

    // Post-processing: store search results in memory for index-based selection
    if (
      (toolName === 'searchProducts' || toolName === 'recallPreviousProducts') &&
      result.success &&
      result.data?.products &&
      Array.isArray(result.data.products)
    ) {
      const productsArray = result.data.products as Array<{ id: string; name: string }>;
      const productsList = productsArray.map((p) => ({ id: p.id, name: p.name }));

      // Store on the customer message entities
      await prisma.message.update({
        where: { id: messageId },
        data: {
          entities: {
            ...(entities as Record<string, unknown>),
            products: productsList,
          } as Prisma.InputJsonValue,
        },
      });

      lastProductResults = productsList;
      executionContext.lastProductResults = productsList;
      searchSucceededThisMessage = true;
      resultsStoredThisMessage = true;
      console.log(`[agent] ${messageId} -> stored ${productsList.length} products in message entities + memory`);
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
        console.log(`[agent] tool "suggestProducts" (intent=${intentToString(item.intent)}) ->`, result);
      } catch (err) {
        console.error(`[agent] tool "suggestProducts" failed for intent ${intentToString(item.intent)}`, err);
        result = { success: false, error: 'Tool execution failed' };
      }
      toolResultCache.set(toolKey, result);
    }

    toolResults.push({ intent: intentToString(item.intent), result });

    if (result.success && result.data?.products && Array.isArray(result.data.products)) {
      const productsArray = result.data.products as Array<{ id: string; name: string }>;
      const productsList = productsArray.map((p) => ({ id: p.id, name: p.name }));

      // Store on the customer message entities
      await prisma.message.update({
        where: { id: messageId },
        data: {
          entities: {
            ...(entities as Record<string, unknown>),
            products: productsList,
          } as Prisma.InputJsonValue,
        },
      });

      lastProductResults = productsList;
      executionContext.lastProductResults = productsList;
      resultsStoredThisMessage = true;
      console.log(`[agent] ${messageId} -> stored ${productsList.length} suggested products in message entities + memory`);
    }
  }

  // A product search that ended with NOT_FOUND/AMBIGUOUS invalidates stale
  // results: the reply must not reference them, and a follow-up PRODUCT_SELECT
  // must not resolve against products that were never offered in this exchange.
  // Fresh suggestion results from this same message are kept.
  let replyMemory = memory;
  let finalLastProductResults = lastProductResults;
  if (productSearchMissed && !resultsStoredThisMessage) {
    finalLastProductResults = [];
    replyMemory = { ...memory, lastProductResults: [] };
    console.log(`[agent] ${messageId} -> product search missed, cleared stale lastProductResults`);
  }

  return { toolResults, replyMemory, finalLastProductResults };
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
    rejectedToRecord,
    tone,
    language,
    replyMemory,
    finalLastProductResults,
  } = state;

  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { conversation: true },
  });
  const { conversation } = message;
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
    memory: replyMemory,
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
      console.error('[agent] failed to parse reply response', { messageId, raw: err.raw });
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
        console.log(`[agent] Reply sent via WhatsApp to ${customer.phone} (${replyParsed.messages.length} messages)`);
      } else {
        console.log(`[agent] No phone found for customer ${conversation.customerId}, reply not sent`);
      }
    } else {
      console.log(`[agent] WhatsApp not connected for merchant ${conversation.merchantId}, reply not sent`);
    }
  } catch (err) {
    console.error(`[agent] Failed to send reply via WhatsApp:`, err);
  }

  // ─── Update conversation memory ─────────────────────────────────────
  await persistMemory(conversation.id, replyMemory, sortedIntents, primaryIntent, conversationAct, finalLastProductResults, rejectedToRecord);

  console.log(`[agent] ${messageId} -> intents=${sortedIntents.map(i => intentToString(i.intent)).join(',')}, reply (${replyParsed.messages.length} msgs):`,
    replyParsed.messages.map((m, i) => `[${i}] "${m.substring(0, 60)}${m.length > 60 ? '...' : ''}"`));
}

export const processMessage = async (messageId: string) => {
  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { conversation: true },
  });
  const { conversation } = message;
  const memory = (conversation.memory as ConversationMemory | null) ?? {};

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
      console.log(`[agent] ${messageId} -> empty message in human-owned conversation, ignored`);
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
        console.error(`[agent] Failed to send fallback reply for ${messageId}:`, err);
      }
    }

    const updatedMemory: ConversationMemory = {
      ...memory,
      lastIntent: 'OUT_OF_SCOPE',
      lastIntents: [{ intent: 'OUT_OF_SCOPE', entities: {} }],
      lastConversationAct: 'DIDNT_UNDERSTAND',
      updatedAt: new Date().toISOString(),
    };
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { memory: updatedMemory as Prisma.InputJsonValue, lastMessageAt: new Date() },
    });
    console.log(`[agent] ${messageId} -> empty message, replied with clarifying fallback`);
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
    console.log(`[agent] ${messageId} -> extracted ${parsed.intents.length} intent(s):`,
      parsed.intents.map(i => `${intentToString(i.intent)}(${i.confidence.toFixed(2)})`));
  } catch (err) {
    if (err instanceof LLMParseError) {
      console.error('[agent] failed to parse intent response', { messageId, raw: err.raw });
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
      console.log(`[agent] ${messageId} -> order override: ${intentToString(item.intent)} was order=${item.order}, now position=${i + 1} (priority=${expectedPriority})`);
    }
  }

  // Save primary intent to message record (backward compat)
  const primaryIntent = sortedIntents[0];

  // A NEGATE message reacting to a presented product list records that list as
  // rejected, so future suggestProducts calls skip it. Computed from the
  // ORIGINAL memory — the customer rejects what was shown before this turn,
  // never a freshly suggested set.
  const rejectedToRecord: ConversationMemory['rejectedProducts'] =
    parsed.conversationAct === 'NEGATE' && memory.lastProductResults?.length
      ? memory.lastProductResults
      : undefined;

  await prisma.message.update({
    where: { id: messageId },
    data: {
      intent: intentToString(primaryIntent.intent),
      entities: primaryIntent.entities,
      confidence: primaryIntent.confidence,
      parsedIntents: sortedIntents as unknown as Prisma.InputJsonValue,
    },
  });

  const executionContext = {
    merchantId: conversation.merchantId,
    customerId: conversation.customerId,
    conversationId: conversation.id,
    currentOrderId: conversation.currentOrderId,
    currentProductId: conversation.currentProductId ?? null,
    lastProductResults: memory.lastProductResults,
    customerWilaya: customer.wilaya,
    customerCommune: customer.commune,
  };

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
        console.log(`[agent] ${messageId} -> recorded suggested intent "${suggested.name}"`);
      } catch (err) {
        console.error(`[agent] failed to record suggested intent "${suggested.name}":`, err);
      }
    }

    if (!takenOver) {
      const result = await executeTool('escalateConversation', {}, executionContext);
      console.log(`[agent] ${messageId} -> escalated conversation (suggested intent), tool ->`, result);
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
        console.log(`[agent] Escalation threshold reached (${consecutiveNegative}/${escalationThreshold}) — escalating conversation ${conversation.id}`);
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
          console.error('[agent] Failed to create escalation notification:', err);
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
    console.log(`[agent] ${messageId} -> deferred layer-2 (${kind})`);
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
    rejectedToRecord,
    tone,
    language: defaultLanguage,
    replyMemory: outcome.replyMemory,
    finalLastProductResults: outcome.finalLastProductResults,
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

  // Hand the conversation back to the AI: read tools are no longer suppressed
  // and generateResponse will produce a reply instead of staying silent.
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { takenOverByHuman: false, escalatedAt: null },
  });

  const parsedIntents = (message.parsedIntents as unknown as IntentItem[] | null) ?? [];
  if (parsedIntents.length === 0) {
    console.log(`[agent] ${messageId} -> no parsedIntents to process, nothing deferred`);
    return;
  }

  const memory = (conversation.memory as ConversationMemory | null) ?? {};
  const agentConfig = await prisma.agentConfig.findUnique({
    where: { merchantId: conversation.merchantId },
  });
  const tone = agentConfig?.tone ?? 'friendly';
  const language = agentConfig?.defaultLanguage ?? 'auto';

  // Deferred read tools — write tools already ran while the human owned the
  // conversation and their results are persisted on the message.
  const outcome = await executeTools(messageId, parsedIntents, { only: 'read' });

  // Merge the write-tool results stored at execution time with the reads just
  // executed. Read tools were excluded from the write-only pass, so no intent
  // appears twice.
  const storedToolResults = (message.toolResults as unknown as ToolResultEntry[] | null) ?? [];
  const toolResults = [...storedToolResults, ...outcome.toolResults];

  const sortedIntents = sortIntents(parsedIntents);
  const primaryIntent = sortedIntents[0];
  const conversationAct = memory.lastConversationAct ?? 'ANSWER';
  const rejectedToRecord: ConversationMemory['rejectedProducts'] =
    conversationAct === 'NEGATE' && memory.lastProductResults?.length
      ? memory.lastProductResults
      : undefined;

  await generateResponse(messageId, toolResults, {
    sortedIntents,
    primaryIntent,
    conversationAct,
    rejectedToRecord,
    tone,
    language,
    replyMemory: outcome.replyMemory,
    finalLastProductResults: outcome.finalLastProductResults,
  });
};
