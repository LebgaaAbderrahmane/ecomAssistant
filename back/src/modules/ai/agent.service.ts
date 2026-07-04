import prisma from '../../config/db.config';
import { callLLM } from './clients/llm.client';
import { parseResponse, LLMParseError } from './parser/response.parser';
import { buildSystemPrompt, AgentContext } from './prompts/promptBuilder';
import { IntentSchema } from './schemas/intents.schemas';

// v1: no state machine yet, so every intent is "allowed" and no tools exist.
// Swap these once stateMachine/transitions.ts and tools/registry.ts land —
// this is the one place that needs to change.
const ALL_INTENTS = IntentSchema.options as readonly string[] as string[];

export const processMessage = async (messageId: string) => {
  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { conversation: true },
  });

  const { conversation } = message;

  const context: AgentContext = {
    state: conversation.state,
    allowedIntents: ALL_INTENTS,
    allowedTools: [],
    memory: (conversation.memory as Record<string, unknown>) ?? {},
  };

  const systemPrompt = buildSystemPrompt(context);
  const raw = await callLLM({ systemPrompt, userMessage: message.text });

  let parsed;
  try {
    parsed = parseResponse(raw);
    console.log("parsed ai response", parsed);
  } catch (err) {
    if (err instanceof LLMParseError) {
      console.error('[agent] failed to parse LLM response', { messageId, raw: err.raw });
    }
    // v1: no retry-then-fallback yet — rethrow and let BullMQ's
    // attempts/backoff (already configured on the queue) handle retries.
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

  console.log(`[agent] ${messageId} -> intent=${parsed.intent} (${parsed.confidence})`);
};