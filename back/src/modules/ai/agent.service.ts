import type { Prisma } from '@prisma/client';
import prisma from '../../config/db.config';
import { callLLM } from './clients/llm.client';
import { parseResponse, parseReplyResponse, LLMParseError } from './parser/response.parser';
import { buildIntentPrompt, buildReplyPrompt, AgentContext, ReplyContext } from './prompts/promptBuilder';
import { IntentSchema, ToolNameSchema } from './schemas/intents.schemas';
import { executeTool, ToolResult } from './tools/registry';
import type { ConversationMemory } from './memory.types';
import { INTENT_RESPONSE_SCHEMA, REPLY_RESPONSE_SCHEMA } from './schemas/gemini.schemas';
import { openwaService } from '../whatsapp/whatsapp.service';

const ALL_INTENTS = IntentSchema.options as readonly string[] as string[];
const ALL_TOOLS = ToolNameSchema.options as readonly string[] as string[];

async function resolveProductId(merchantId: string, productName: string): Promise<string | null> {
  const product = await prisma.product.findFirst({
    where: {
      merchantId,
      name: { contains: productName, mode: 'insensitive' },
    },
  });
  return product?.id ?? null;
}

export const processMessage = async (messageId: string) => {
  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { conversation: true },
  });
  const { conversation } = message;
  const memory = (conversation.memory as ConversationMemory | null) ?? {};

  // Fetch customer record for delivery info and WhatsApp sending
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: conversation.customerId },
  });

  // --- LLM #1: intent extraction ---
  const intentContext: AgentContext = {
    state: conversation.state,
    allowedIntents: ALL_INTENTS,
    allowedTools: ALL_TOOLS,
    memory,
  };
  const rawIntent = await callLLM({
  systemPrompt: buildIntentPrompt(intentContext),
  userMessage: message.text,
  responseSchema: INTENT_RESPONSE_SCHEMA,
});

  let parsed;
  try {
    parsed = parseResponse(rawIntent);
    console.log(`[agent] ${messageId} -> raw intent response:`, parsed);
  } catch (err) {
    if (err instanceof LLMParseError) {
      console.error('[agent] failed to parse intent response', { messageId, raw: err.raw });
    }
    throw err;
  }

  await prisma.message.update({
    where: { id: messageId },
    data: {
      intent: parsed.intent,
      entities: parsed.entities,
      confidence: parsed.confidence,
    },
  });

  // --- Enrich entities: resolve productId from product name ---
  if (parsed.entities.product && !parsed.entities.productId) {
    const resolvedId = await resolveProductId(conversation.merchantId, parsed.entities.product as string);
    if (resolvedId) {
      parsed.entities.productId = resolvedId;
      // Re-save entities with the resolved productId
      await prisma.message.update({
        where: { id: messageId },
        data: { entities: parsed.entities },
      });
      console.log(`[agent] ${messageId} -> resolved productId "${resolvedId}" for product "${parsed.entities.product}"`);
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
      currentProductId: conversation.currentProductId ?? null,
      lastProductResults: memory.lastProductResults,
      customerWilaya: customer.wilaya,
      customerCommune: customer.commune,
    });
    console.log(`[agent] tool "${parsed.toolSuggestion}" ->`, toolResult);
  }

  // --- Store search results in entities + memory for index-based selection ---
  let lastProductResults = memory.lastProductResults;
  if (
    parsed.toolSuggestion === 'searchProducts' &&
    toolResult?.success &&
    toolResult.data?.products &&
    Array.isArray(toolResult.data.products)
  ) {
    const productsArray = toolResult.data.products as Array<{ id: string; name: string }>;
    const productsList = productsArray.map((p) => ({ id: p.id, name: p.name }));

    // Store on the customer message entities
    await prisma.message.update({
      where: { id: messageId },
      data: {
        entities: {
          ...(parsed.entities as Record<string, unknown>),
          products: productsList,
        } as Prisma.InputJsonValue,
      },
    });

    lastProductResults = productsList;
    console.log(`[agent] ${messageId} -> stored ${productsList.length} products in message entities + memory`);
  }

  // --- LLM #2: reply generation ---
  const replyContext: ReplyContext = {
    intent: parsed.intent,
    conversationAct: parsed.conversationAct,
    entities: parsed.entities,
    toolResult,
    memory,
  };
  
const rawReply = await callLLM({
  systemPrompt: buildReplyPrompt(replyContext),
  userMessage: message.text,
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

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'OUT',
      sender: 'AI',
      content: replyParsed.response,
      text: replyParsed.response,
      role: 'assistant',
    },
  });

  // --- Send reply via WhatsApp ---
  try {
    const waSession = await prisma.whatsAppSession.findUnique({
      where: { merchantId: conversation.merchantId },
    });
    if (waSession && (waSession.status === 'connected' || waSession.status === 'ready')) {
      if (customer?.phone) {
        await openwaService.sendText(waSession.sessionId, customer.phone, replyParsed.response);
        console.log(`[agent] Reply sent via WhatsApp to ${customer.phone}`);
      } else {
        console.log(`[agent] No phone found for customer ${conversation.customerId}, reply not sent`);
      }
    } else {
      console.log(`[agent] WhatsApp not connected for merchant ${conversation.merchantId}, reply not sent`);
    }
  } catch (err) {
    console.error(`[agent] Failed to send reply via WhatsApp:`, err);
  }

  // --- Update conversation memory ---
  const updatedMemory: ConversationMemory = {
    ...memory,
    lastIntent: parsed.intent,
    lastConversationAct: parsed.conversationAct,
    entities: { ...(memory.entities ?? {}), ...parsed.entities },
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

  console.log(`[agent] ${messageId} -> intent=${parsed.intent}, reply="${replyParsed.response}"`);
};