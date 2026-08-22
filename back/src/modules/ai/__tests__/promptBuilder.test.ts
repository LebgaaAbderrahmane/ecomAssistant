import { describe, it, expect } from 'vitest';
import { buildIntentPrompt } from '../prompts/promptBuilder';

const BASE_CTX = {
  state: 'PRODUCT_DISCOVERY',
  allowedIntents: ['PRODUCT_SEARCH', 'ORDER_CONFIRM'],
  allowedTools: ['searchProducts'],
  memory: { lastIntent: 'PRODUCT_SEARCH' },
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
});
