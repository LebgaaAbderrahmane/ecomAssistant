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

  // --- LLM #2: reply generation ---
  const replyContext: ReplyContext = {
    intent: parsed.intent,
    conversationAct: parsed.conversationAct,
    entities: parsed.entities,
    toolResult,
    memory,
    tone,
    language: defaultLanguage,
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
      text: replyParsed.response,
      role: 'assistant',
      content: replyParsed.response,
    },
  });

  // --- Send reply via WhatsApp ---
  try {
    const waSession = await prisma.whatsAppSession.findUnique({
      where: { merchantId: conversation.merchantId },
    });
    if (waSession && (waSession.status === 'connected' || waSession.status === 'ready')) {
      const customer = await prisma.customer.findUnique({
        where: { id: conversation.customerId },
      });
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
    recentIntents: updatedRecentIntents,
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
