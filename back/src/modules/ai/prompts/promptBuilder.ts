import { INTENT_EXTRACTION_RULES, REPLY_GENERATION_RULES } from './systemPrompts';

// unchanged — LLM #1's context
export interface AgentContext {
  state: string;
  allowedIntents: string[];
  allowedTools: string[];
  memory: Record<string, unknown>;
}

export function buildIntentPrompt(ctx: AgentContext): string {
  return [
    INTENT_EXTRACTION_RULES,
    '',
    `Current conversation state: ${ctx.state}`,
    `Allowed intents right now: ${ctx.allowedIntents.join(', ')}`,
    `Allowed tools right now: ${ctx.allowedTools.length ? ctx.allowedTools.join(', ') : 'none'}`,
    '',
    'Context (memory):',
    JSON.stringify(ctx.memory, null, 2),
  ].join('\n');
}

// LLM #2's context — what happened, not what's allowed to happen
export interface ReplyContext {
  intent: string;
  conversationAct: string;
  entities: Record<string, unknown>;
  toolResult: Record<string, unknown> | null; // null = no tool ran / not available yet
  memory: Record<string, unknown>;
}

export function buildReplyPrompt(ctx: ReplyContext): string {
  return [
    REPLY_GENERATION_RULES,
    '',
    `Customer intent: ${ctx.intent}`,
    `Conversation tone: ${ctx.conversationAct}`,
    'Extracted entities:',
    JSON.stringify(ctx.entities, null, 2),
    '',
    ctx.toolResult
      ? `Tool result:\n${JSON.stringify(ctx.toolResult, null, 2)}`
      : 'No tool result available — do not state facts you do not have.',
    '',
    'Context (memory):',
    JSON.stringify(ctx.memory, null, 2),
  ].join('\n');
}