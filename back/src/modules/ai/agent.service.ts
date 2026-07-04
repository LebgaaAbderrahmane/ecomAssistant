import prisma from '../../config/db.config';
import { callLLM } from './clients/llm.client';
import { parseResponse, LLMParseError } from './parser/response.parser';
import { buildIntentPrompt, buildReplyPrompt, AgentContext, ReplyContext } from './prompts/promptBuilder';
import { IntentSchema } from './schemas/intents.schemas';

const ALL_INTENTS = IntentSchema.options as readonly string[] as string[];

export const processMessage = async (messageId: string) => {
  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { conversation: true },
  });
  const { conversation } = message;
  const memory = (conversation.memory as Record<string, unknown>) ?? {};

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
  // toolSuggestion is intentionally not persisted — it's transient input
  // to this decision, not conversation state.
  let toolResult: Record<string, unknown> | null = null;
  if (parsed.toolSuggestion) {
    console.log(`[agent] LLM suggested tool "${parsed.toolSuggestion}" — no registry yet, skipping`);
    // toolResult stays null; LLM #2 is told explicitly it has no data
  }

  // --- LLM #2: reply generation ---
  const replyContext: ReplyContext = {
    intent: parsed.intent,
    conversationAct: parsed.conversationAct,
    entities: parsed.entities,
    toolResult,
    memory,
  };
  const reply = await callLLM({
    systemPrompt: buildReplyPrompt(replyContext),
    userMessage: message.text,
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'OUT',
      sender: 'AI',
      text: reply.trim(),
    },
  });

  console.log(`[agent] ${messageId} -> intent=${parsed.intent}, reply="${reply.trim()}"`);
};