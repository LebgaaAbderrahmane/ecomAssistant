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

export interface IntentContext {
  intent: string;
  entities: Record<string, string | number | boolean | null>;
  status: string;
  candidates?: string[] | null;
}

export interface ReplyContext {
  intents: IntentContext[];
  conversationAct: string;
  toolResults: Array<{ intent: string; result: ToolResult | null }>;
  memory: ConversationMemory;
}

export function buildReplyPrompt(ctx: ReplyContext): string {
  // Build tool results section — one block per intent
  const toolSections: string[] = [];
  for (const tr of ctx.toolResults) {
    if (!tr.result) {
      toolSections.push(`[${tr.intent}] No tool was needed for this intent.`);
    } else if (tr.result.success) {
      const sanitized = stripInternalIds(tr.result.data);
      toolSections.push(`[${tr.intent}] Result:\n${JSON.stringify(sanitized, null, 2)}`);
    } else {
      toolSections.push(`[${tr.intent}] Failed: ${tr.result.error}. Do not guess — tell the customer you're checking, or ask a clarifying question.`);
    }
  }

  // Build intents summary
  const intentLines = ctx.intents.map(item => {
    let line = `  - ${item.intent} (status: ${item.status})`;
    if (item.candidates?.length) {
      line += ` — candidates: ${item.candidates.join(', ')}`;
    }
    return line;
  });

  const toolSection = toolSections.length > 0
    ? toolSections.join('\n\n')
    : 'No tool was called for this message — do not state facts you do not have.';

  return [
    REPLY_GENERATION_RULES,
    '',
    'Customer intents (in execution order):',
    intentLines.join('\n'),
    '',
    `Conversation tone: ${ctx.conversationAct}`,
    '',
    'Tool results:',
    toolSection,
    '',
    'Context (memory):',
    JSON.stringify(ctx.memory, null, 2),
  ].join('\n');
}
