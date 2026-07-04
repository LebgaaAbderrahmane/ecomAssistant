import type { Prisma } from '@prisma/client';
import prisma from '../../config/db.config';
import { callLLM } from './clients/llm.client';
import { parseResponse, parseReplyResponse, LLMParseError } from './parser/response.parser';
import { buildIntentPrompt, buildReplyPrompt, AgentContext, ReplyContext } from './prompts/promptBuilder';
import { IntentSchema } from './schemas/intents.schemas';

const ALL_INTENTS = IntentSchema.options as readonly string[] as string[];

// Typed shape for what we actually read/write in Conversation.memory (a Json
// column). Kept here rather than in promptBuilder.ts since this file owns
// reading/writing it — promptBuilder just consumes whatever shape it's given.
export interface ConversationMemory {
  lastIntent?: string;
  lastConversationAct?: string;
  entities?: Record<string, string | number | boolean | null>;
  updatedAt?: string;
}

export const processMessage = async (messageId: string) => {
  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { conversation: true },
  });
  const { conversation } = message;
  const memory = (conversation.memory as ConversationMemory | null) ?? {};

  // --- LLM #1: intent extraction ---
  const intentContext: AgentContext = {
    state: conversation.state,
    allowedIntents: ALL_INTENTS,
    allowedTools: [],
    memory,
  };
  const rawIntent = await callLLM({
    systemPrompt: buildIntentPrompt(intentContext),
    userMessage: message.text,
  });

  let parsed;
  try {
    parsed = parseResponse(rawIntent);
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

  // --- Tool step: stubbed until tools/registry.ts exists ---
  // toolSuggestion is intentionally not persisted — it's transient input to
  // this decision, not conversation state.
  let toolResult: Record<string, unknown> | null = null;
  if (parsed.toolSuggestion) {
    console.log(`[agent] LLM suggested tool "${parsed.toolSuggestion}" — no registry yet, skipping`);
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
    },
  });

  // --- Update conversation memory ---
  // Placeholder shape: last intent/tone overwritten each turn, entities
  // shallow-merged so info from earlier turns (e.g. product mentioned two
  // messages ago) survives until the state machine defines something better.
  const updatedMemory: ConversationMemory = {
    ...memory,
    lastIntent: parsed.intent,
    lastConversationAct: parsed.conversationAct,
    entities: { ...(memory.entities ?? {}), ...parsed.entities },
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