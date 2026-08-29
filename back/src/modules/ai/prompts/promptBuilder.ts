import { INTENT_EXTRACTION_RULES, REPLY_GENERATION_RULES } from './systemPrompts';
import type { ConversationMemory } from '../memory.types';
import type { ToolResult } from '../tools/registry';
import type { RecentConversationMessage } from '../conversation/history.service';

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
  knownSuggestedIntents?: Array<{ name: string; description: string | null }>;
  lastAssistantMessage?: string | null;
  recentMessages?: RecentConversationMessage[];
}

function renderTranscript(recentMessages: RecentConversationMessage[]): string {
  return recentMessages
    .map((m) => `[${m.sender}] ${m.text}`)
    .join('\n');
}

export function buildIntentPrompt(ctx: AgentContext): string {
  const sections = [
    INTENT_EXTRACTION_RULES,
    '',
    // Conversation state is context, not a decision. Short follow-ups are
    // interpreted against the last assistant message (below) and the memory,
    // never against the raw state alone.
    `Current conversation state (context only, not a decision): ${ctx.state}`,
    `Allowed intents right now: ${ctx.allowedIntents.join(', ')}`,
    `Allowed tools right now: ${ctx.allowedTools.length ? ctx.allowedTools.join(', ') : 'none'}`,
  ];

  if (ctx.lastAssistantMessage) {
    sections.push(
      '',
      `Last assistant message (what the customer is reacting to): "${ctx.lastAssistantMessage}"`,
    );
  }

  if (ctx.recentMessages?.length) {
    sections.push(
      '',
      'Recent conversation transcript (oldest → newest):',
      renderTranscript(ctx.recentMessages),
    );
  }

  if (ctx.knownSuggestedIntents?.length) {
    const list = ctx.knownSuggestedIntents
      .map(s => `  ${s.name} (suggested) — ${s.description ?? ''}`)
      .join('\n');
    sections.push('', 'Previously suggested intents (reuse these names if they match):', list);
  }

  sections.push('', 'Context (memory):', JSON.stringify(ctx.memory, null, 2));

  // Prefer product results from the active flow; fall back to legacy flat memory.
  const activeFlow = ctx.memory.activeFlow
    ? ctx.memory.flows.find((f) => f.flowId === ctx.memory.activeFlow)
    : undefined;

  let names: string[] | undefined;
  if (activeFlow && activeFlow.state !== 'IDLE') {
    names = activeFlow.productDiscovery.toolResults.map((p) => p.productName);
  } else {
    const legacy = (ctx.memory as unknown as { lastProductResults?: Array<{ name: string }> });
    names = legacy.lastProductResults?.map((p) => p.name);
  }

  if (names?.length) {
    const list = names
      .map((name, i) => `  ${i}: ${name}`)
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
  toolResult?: ToolResult | null;
  memory?: ConversationMemory;
  tone?: string;
  language?: string;
  status: string;
  candidates?: string[] | null;
}

export interface ReplyContext {
  intents: IntentContext[];
  conversationAct: string;
  toolResults: Array<{ intent: string; result: ToolResult | null }>;
  memory: ConversationMemory;
  tone?: string;
  language?: string;
}

export function buildReplyPrompt(ctx: ReplyContext): string {
  // Build tool results section — one block per intent
  const toolSections: string[] = [];
  for (const tr of ctx.toolResults) {
    if (!tr.result) {
      toolSections.push(`[${tr.intent}] No tool was needed for this intent.`);
    } else if (tr.result.outcome === 'NOT_FOUND') {
      // Definitive absence — the item does not exist. Never ask for more
      // details, never suggest alternatives, and never imply it might be
      // available later.
      toolSections.push(
        `[${tr.intent}] NOT_FOUND: ${tr.result.error} ` +
        `This is definitive — the item does not exist in the store. Tell the customer directly that it is not available. ` +
        `Do NOT ask follow-up questions about it, do NOT suggest alternative or similar products unless the customer explicitly asked for recommendations, ` +
        `do NOT imply it might be in stock later, and do NOT search again for the same product.`,
      );
    } else if (tr.result.outcome === 'AMBIGUOUS') {
      // Insufficient info — we can't say "not available", we need to know WHAT.
      // This should only fire when neither the message nor the conversation
      // memory could resolve the reference.
      toolSections.push(
        `[${tr.intent}] AMBIGUOUS: ${tr.result.error} ` +
        `The reference could not be resolved from the message or from products already discussed in this conversation. ` +
        `Ask the customer which product (name, color, or model) they mean. Do NOT tell them the product is unavailable.`,
      );
    } else if (tr.result.success) {
      const sanitized = stripInternalIds(tr.result.data);
      toolSections.push(`[${tr.intent}] Result:\n${JSON.stringify(sanitized, null, 2)}`);
    } else {
      toolSections.push(`[${tr.intent}] Failed: ${tr.result.error}. Do not guess — tell the customer you're checking, or ask a clarifying question.`);
    }
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

  // Intents summary (in execution order)
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

  // Detect if any tool returned NOT_FOUND so we can add a hard override.
  const hasNotFound = ctx.toolResults.some(tr => tr.result?.outcome === 'NOT_FOUND');

  lines.push(
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
  );

  if (hasNotFound) {
    lines.push(
      '',
      'CRITICAL: At least one intent returned NOT_FOUND. This is a definitive answer — the product does not exist. ' +
      'Say so directly. Never say "I\'ll check", "wait for me", "let me verify", or any similar phrase. ' +
      'NOT_FOUND is not missing information — it IS the information.',
    );
  }

  return lines.join('\n');
}
