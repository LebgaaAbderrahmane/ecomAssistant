import { INTENT_EXTRACTION_RULES, REPLY_GENERATION_RULES } from './systemPrompts';
import type { ConversationMemory } from '../memory.types';
import type { ToolResult } from '../tools/registry';

export interface AgentContext {
  state: string;
  allowedIntents: string[];
  allowedTools: string[];
  memory: ConversationMemory;
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

export interface ReplyContext {
  intent: string;
  conversationAct: string;
  entities: Record<string, string | number | boolean | null>;
  toolResult: ToolResult | null;
  memory: ConversationMemory;
  tone?: string;
  language?: string;
}

export function buildReplyPrompt(ctx: ReplyContext): string {
  let toolSection: string;
  if (!ctx.toolResult) {
    toolSection = 'No tool result available — do not state facts you do not have.';
  } else if (ctx.toolResult.success) {
    toolSection = `Tool result:\n${JSON.stringify(ctx.toolResult.data, null, 2)}`;
  } else {
    toolSection = `Tool lookup failed: ${ctx.toolResult.error}. Do not guess — tell the customer you're checking, or ask a clarifying question.`;
  }

  const lines = [REPLY_GENERATION_RULES];

  // Tone override
  if (ctx.tone && ctx.tone !== 'friendly') {
    const toneMap: Record<string, string> = {
      formal: 'Adopt a formal, professional tone. Use "vous" and proper grammar. Avoid slang and emojis.',
      friendly: '',
    };
    const toneOverride = toneMap[ctx.tone];
    if (toneOverride) {
      lines.push('');
      lines.push(`Tone override: ${toneOverride}`);
    }
  }

  // Language preference
  if (ctx.language && ctx.language !== 'auto') {
    const langMap: Record<string, string> = {
      french: 'Always respond in French.',
      arabic: 'Always respond in Modern Standard Arabic.',
      derdja: 'Always respond in Algerian Darija (Latin or Arabic script).',
    };
    const langOverride = langMap[ctx.language];
    if (langOverride) {
      lines.push('');
      lines.push(langOverride);
    }
  }

  lines.push('');
  lines.push(`Customer intent: ${ctx.intent}`);
  lines.push(`Conversation tone: ${ctx.conversationAct}`);
  lines.push('Extracted entities:');
  lines.push(JSON.stringify(ctx.entities, null, 2));
  lines.push('');
  lines.push(toolSection);
  lines.push('');
  lines.push('Context (memory):');
  lines.push(JSON.stringify(ctx.memory, null, 2));

  return lines.join('\n');
}
