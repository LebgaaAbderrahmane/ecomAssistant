import { INTENT_EXTRACTION_RULES, REPLY_GENERATION_RULES } from './systemPrompts';
import type { ConversationMemory } from '../memory.types';
import type { ToolResult } from '../tools/registry';

const ID_KEY_PATTERN = /^id$|^[a-z]+[Ii]d$/;

function stripInternalIds(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(stripInternalIds);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([key]) => !ID_KEY_PATTERN.test(key))
        .map(([key, val]) => [key, stripInternalIds(val)])
    );
  }
  return obj;
}

export interface AgentContext {
  state: string;
  allowedIntents: string[];
  allowedTools: string[];
  memory: ConversationMemory;
}

export function buildIntentPrompt(ctx: AgentContext): string {
  const sections = [
    INTENT_EXTRACTION_RULES,
    '',
    `Current conversation state: ${ctx.state}`,
    `Allowed intents right now: ${ctx.allowedIntents.join(', ')}`,
    `Allowed tools right now: ${ctx.allowedTools.length ? ctx.allowedTools.join(', ') : 'none'}`,
    '',
    'Context (memory):',
    JSON.stringify(ctx.memory, null, 2),
  ];

  if (ctx.memory.lastProductResults?.length) {
    const list = ctx.memory.lastProductResults
      .map((p, i) => `  ${i}: ${p.name}`)
      .join('\n');
    sections.push(
      '',
      'Last product search results (index : product name):',
      list,
    );
  }

  return sections.join('\n');
}

export interface ReplyContext {
  intent: string;
  conversationAct: string;
  entities: Record<string, string | number | boolean | null>;
  toolResult: ToolResult | null;
  memory: ConversationMemory; // was Record<string, unknown> — same bug as AgentContext had
}

export function buildReplyPrompt(ctx: ReplyContext): string {
  let toolSection: string;
  if (!ctx.toolResult) {
    toolSection = 'No tool result available — do not state facts you do not have.';
  } else if (ctx.toolResult.success) {
    const sanitized = stripInternalIds(ctx.toolResult.data);
    toolSection = `Tool result:\n${JSON.stringify(sanitized, null, 2)}`;
  } else {
    toolSection = `Tool lookup failed: ${ctx.toolResult.error}. Do not guess — tell the customer you're checking, or ask a clarifying question.`;
  }

  return [
    REPLY_GENERATION_RULES,
    '',
    `Customer intent: ${ctx.intent}`,
    `Conversation tone: ${ctx.conversationAct}`,
    'Extracted entities:',
    JSON.stringify(ctx.entities, null, 2),
    '',
    toolSection,
    '',
    'Context (memory):',
    JSON.stringify(ctx.memory, null, 2),
  ].join('\n');
}