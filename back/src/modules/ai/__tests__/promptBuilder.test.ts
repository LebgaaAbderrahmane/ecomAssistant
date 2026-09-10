import { describe, it, expect } from 'vitest';
import { buildIntentPrompt, buildReplyPrompt, type ReplyContext } from '../prompts/promptBuilder';
import type { Flow } from '../memory.types';

const BASE_CTX = {
  state: 'PRODUCT_DISCOVERY',
  allowedIntents: ['PRODUCT_SEARCH', 'ORDER_CONFIRM'],
};

describe('buildIntentPrompt', () => {
  it('frames the conversation state as context, not a decision', () => {
    const prompt = buildIntentPrompt(BASE_CTX);
    expect(prompt).toMatch(/Current conversation state \(context only, not a decision\): PRODUCT_DISCOVERY/);
  });

  it('includes the state-as-context classification rule', () => {
    const prompt = buildIntentPrompt(BASE_CTX);
    expect(prompt).toMatch(/Conversation state is context, not evidence/);
    expect(prompt).toMatch(/short follow-ups/i);
  });

  it('includes the search-vs-suggest routing rule', () => {
    const prompt = buildIntentPrompt(BASE_CTX);
    expect(prompt).toMatch(/PRODUCT_SEARCH vs PRODUCT_SUGGEST/);
    expect(prompt).toMatch(/PRODUCT_SUGGEST/);
  });

  it('includes the last assistant message so "okay" is interpreted against it', () => {
    const prompt = buildIntentPrompt({
      ...BASE_CTX,
      lastAssistantMessage: 'Voici les résultats : 1. Serwal La Toile',
    });
    expect(prompt).toMatch(/Last assistant message/);
    expect(prompt).toMatch(/Serwal La Toile/);
  });

  it('omits the last assistant message section when there is none', () => {
    const prompt = buildIntentPrompt({ ...BASE_CTX, lastAssistantMessage: null });
    expect(prompt).not.toMatch(/Last assistant message \(what the customer is reacting to\)/);
  });

  it('renders the recent conversation transcript with sender labels', () => {
    const prompt = buildIntentPrompt({
      ...BASE_CTX,
      recentMessages: [
        { direction: 'out', sender: 'assistant', text: 'Voici nos chaussures' },
        { direction: 'in', sender: 'customer', text: 'Je prends la première' },
        { direction: 'out', sender: 'assistant', text: 'Parfait !' },
      ],
    });
    expect(prompt).toMatch(/Recent conversation transcript \(oldest → newest\):/);
    expect(prompt).toMatch(/\[assistant\] Voici nos chaussures/);
    expect(prompt).toMatch(/\[customer\] Je prends la première/);
    expect(prompt).toMatch(/\[assistant\] Parfait !/);
  });

  it('preserves oldest → newest order in the transcript', () => {
    const prompt = buildIntentPrompt({
      ...BASE_CTX,
      recentMessages: [
        { direction: 'in', sender: 'customer', text: 'first' },
        { direction: 'out', sender: 'assistant', text: 'second' },
      ],
    });
    const firstIdx = prompt.indexOf('[customer] first');
    const secondIdx = prompt.indexOf('[assistant] second');
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(firstIdx);
  });

  it('omits the transcript section when there are no recent messages', () => {
    const prompt = buildIntentPrompt({ ...BASE_CTX, recentMessages: [] });
    expect(prompt).not.toMatch(/Recent conversation transcript \(oldest → newest\):/);
  });

  it('does not include the allowed tools section', () => {
    const prompt = buildIntentPrompt({ ...BASE_CTX });
    expect(prompt).not.toMatch(/Allowed tools right now/);
  });

  it('keeps the allowed intents section', () => {
    const prompt = buildIntentPrompt({ ...BASE_CTX });
    expect(prompt).toMatch(/Allowed intents right now: PRODUCT_SEARCH, ORDER_CONFIRM/);
  });

  it('instructs LLM #1 to only set productIndex when the list is visible in the transcript', () => {
    const prompt = buildIntentPrompt(BASE_CTX);
    expect(prompt).toMatch(/productIndex/);
    expect(prompt).toMatch(/Recent conversation transcript/);
    expect(prompt).toMatch(/did NOT enumerate/i);
  });
});

describe('buildReplyPrompt', () => {
  const REPLY_BASE: ReplyContext = {
    intents: [{ intent: 'PRODUCT_DETAILS', entities: {}, status: 'executed' }],
    conversationAct: 'informative',
    toolResults: [
      {
        intent: 'PRODUCT_DETAILS',
        result: {
          success: true,
          data: {
            productName: 'Serwal',
            price: 2500,
            description: 'Un serwal confortable',
            productImages: ['https://img/1.jpg'],
          },
        },
      },
    ],
    memory: { version: 1 as const, globalInformation: {}, flows: [] as Flow[] },
  };

  it('includes the getProductDetails answer-fidelity rule', () => {
    const prompt = buildReplyPrompt(REPLY_BASE);
    expect(prompt).toMatch(/answer ONLY the specific question the customer asked/i);
    expect(prompt).toMatch(/Never recite every field/);
  });

  it('includes the picture-confirmation guidance', () => {
    const prompt = buildReplyPrompt(REPLY_BASE);
    expect(prompt).toMatch(/photo.*being sent/i);
  });
});
