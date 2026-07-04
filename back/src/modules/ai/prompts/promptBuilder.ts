import { INTENT_EXTRACTION_RULES } from './systemPrompts';

// Kept as plain strings for now rather than importing from stateMachine/states.ts,
// since that file isn't built yet — swap these for the real enums once
// stateMachine/states.ts and tools/registry.ts exist, so this stays a single
// source of truth instead of drifting.
export interface AgentContext {
  state: string; // ConversationState, once states.ts exists
  allowedIntents: string[]; // from stateMachine/transitions.ts, §4.1
  allowedTools: string[]; // from tools/registry.ts, filtered by state
  memory: Record<string, unknown>; // short-term memory object, §5.1
}

export function buildSystemPrompt(ctx: AgentContext): string {
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