import type { Prisma } from '@prisma/client';
import prisma from '../../config/db.config';
import { callLLM } from './clients/llm.client';
import { parseResponse, parseReplyResponse, LLMParseError } from './parser/response.parser';
import { buildIntentPrompt, buildReplyPrompt, AgentContext, ReplyContext } from './prompts/promptBuilder';
import { IntentSchema, ToolNameSchema, resolveTool } from './schemas/intents.schemas';
import { executeTool, ToolResult } from './tools/registry';
import type { ConversationMemory, IntentSummary } from './memory.types';
import type { IntentItem } from './schemas/ai.schemas';
import { INTENT_RESPONSE_SCHEMA, REPLY_RESPONSE_SCHEMA } from './schemas/gemini.schemas';
import { openwaService } from '../whatsapp/whatsapp.service';
import type { ImageCategory } from './media/imageCaption.service';

const ALL_INTENTS = IntentSchema.options as readonly string[] as string[];
const ALL_TOOLS = ToolNameSchema.options as readonly string[] as string[];

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
    const pa = INTENT_PRIORITY[a.intent] ?? 5;
    const pb = INTENT_PRIORITY[b.intent] ?? 5;
    return pa - pb;
  });
}

export const processMessage = async (messageId: string) => {
  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { conversation: true },
  });
  const { conversation } = message;
  const memory = (conversation.memory as ConversationMemory | null) ?? {};

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

  // ─── Empty message guard ────────────────────────────────────────────
  // No transcribable content (e.g. media omitted by the gateway). Skip the LLM
  // pipeline entirely — never let empty input hallucinate an intent like
  // ORDER_CONFIRM. Reply with a clarifying message instead.
  if (!effectiveText || !effectiveText.trim()) {
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

  // ─── LLM #1: multi-intent extraction ────────────────────────────────
  const intentContext: AgentContext = {
    state: conversation.state,
    allowedIntents: ALL_INTENTS,
    allowedTools: ALL_TOOLS,
    memory,
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
      parsed.intents.map(i => `${i.intent}(${i.confidence.toFixed(2)})`));
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
    const expectedPriority = INTENT_PRIORITY[item.intent] ?? 5;
    if (item.order !== i + 1) {
      console.log(`[agent] ${messageId} -> order override: ${item.intent} was order=${item.order}, now position=${i + 1} (priority=${expectedPriority})`);
    }
  }

  // Save primary intent to message record (backward compat)
  const primaryIntent = sortedIntents[0];
  await prisma.message.update({
    where: { id: messageId },
    data: {
      intent: primaryIntent.intent,
      entities: primaryIntent.entities,
      confidence: primaryIntent.confidence,
    },
  });

  // --- Check escalation threshold ---
  const recentIntents = (memory.recentIntents ?? []) as string[];
  const updatedRecentIntents = [...recentIntents, `${parsed.intent}:${parsed.conversationAct}`].slice(-10);

  if (
    !conversation.takenOverByHuman &&
    (parsed.conversationAct === 'DIDNT_UNDERSTAND' || parsed.conversationAct === 'FRUSTRATED')
  ) {
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

  // --- Tool execution ---
  let toolResult: ToolResult | null = null;
  if (parsed.toolSuggestion) {
    toolResult = await executeTool(parsed.toolSuggestion, parsed.entities, {
      merchantId: conversation.merchantId,
      customerId: conversation.customerId,
      conversationId: conversation.id,
      currentOrderId: conversation.currentOrderId,
    });
    console.log(`[agent] tool "${parsed.toolSuggestion}" ->`, toolResult);
  }
  // ─── Entity enrichment + tool execution loop ─────────────────────────
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

  const toolResults: Array<{ intent: string; result: ToolResult | null }> = [];
  let lastProductResults = memory.lastProductResults;

  for (const item of sortedIntents) {
    // Skip intents that are marked unresolved
    if (item.status === 'unresolved') {
      toolResults.push({
        intent: item.intent,
        result: { success: false, error: item.unresolvedReason ?? 'Intent present but cannot be acted on' },
      });
      continue;
    }

    // Resolve tool from intent
    const toolName = resolveTool(item.intent, item.entities);
    if (!toolName) {
      toolResults.push({ intent: item.intent, result: null });
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

    // Execute tool with per-intent error handling
    let result: ToolResult;
    try {
      result = await executeTool(toolName, entities, executionContext);
      console.log(`[agent] tool "${toolName}" (intent=${item.intent}) ->`, result);
    } catch (err) {
      console.error(`[agent] tool "${toolName}" failed for intent ${item.intent}`, err);
      result = { success: false, error: 'Tool execution failed' };
    }

    toolResults.push({ intent: item.intent, result });

    // Post-processing: store search results in memory for index-based selection
    if (
      toolName === 'searchProducts' &&
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
      console.log(`[agent] ${messageId} -> stored ${productsList.length} products in message entities + memory`);
    }
  }

  // ─── LLM #2: reply generation (single call for all intents) ─────────
  const replyContext: ReplyContext = {
    intents: sortedIntents.map(item => ({
      intent: item.intent,
      entities: item.entities,
      status: item.status,
      candidates: item.candidates,
    })),
    conversationAct: parsed.conversationAct,
    toolResults,
    memory,
    tone,
    language: defaultLanguage,
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
  const intentSummaries: IntentSummary[] = sortedIntents.map(item => ({
    intent: item.intent,
    entities: item.entities,
  }));

  const updatedMemory: ConversationMemory = {
    ...memory,
    lastIntent: primaryIntent.intent,
    lastIntents: intentSummaries,
    lastConversationAct: parsed.conversationAct,
    entities: { ...(memory.entities ?? {}), ...primaryIntent.entities },
    lastProductResults: lastProductResults ?? memory.lastProductResults,
    updatedAt: new Date().toISOString(),
  };

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      memory: updatedMemory as Prisma.InputJsonValue,
      lastMessageAt: new Date(),
    },
  });

  console.log(`[agent] ${messageId} -> intents=${sortedIntents.map(i => i.intent).join(',')}, reply (${replyParsed.messages.length} msgs):`,
    replyParsed.messages.map((m, i) => `[${i}] "${m.substring(0, 60)}${m.length > 60 ? '...' : ''}"`));
};
