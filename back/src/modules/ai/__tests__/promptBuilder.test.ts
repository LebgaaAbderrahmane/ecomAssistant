import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
    assert.match(prompt, /Current conversation state \(context only, not a decision\): PRODUCT_DISCOVERY/);
  });

  it('includes the state-as-context classification rule', () => {
    const prompt = buildIntentPrompt(BASE_CTX);
    assert.match(prompt, /Conversation state is context, not evidence/);
    assert.match(prompt, /short follow-ups/i);
  });

  it('includes the search-vs-suggest routing rule', () => {
    const prompt = buildIntentPrompt(BASE_CTX);
    assert.match(prompt, /PRODUCT_SEARCH vs PRODUCT_SUGGEST/);
    assert.match(prompt, /PRODUCT_SUGGEST/);
  });

  it('includes the last assistant message so "okay" is interpreted against it', () => {
    const prompt = buildIntentPrompt({
      ...BASE_CTX,
      lastAssistantMessage: 'Voici les résultats : 1. Serwal La Toile',
    });
    assert.match(prompt, /Last assistant message/);
    assert.match(prompt, /Serwal La Toile/);
  });

  it('omits the last assistant message section when there is none', () => {
    const prompt = buildIntentPrompt({ ...BASE_CTX, lastAssistantMessage: null });
    assert.doesNotMatch(prompt, /Last assistant message \(what the customer is reacting to\)/);
  });
});
