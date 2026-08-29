import { describe, it, expect } from 'vitest';
import { buildIntentPrompt, buildReplyPrompt, type ReplyContext } from '../prompts/promptBuilder';
import type { Flow } from '../memory.types';

const activeFlow: Flow = {
  flowId: 'f1',
  state: 'PRODUCT_DISCOVERY',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  productDiscovery: {
    input: { productName: 'shoes', filters: {} },
    toolResults: [
      { productId: 'p1', productName: 'Nike Air', price: 5000, variants: [] },
      { productId: 'p2', productName: 'Adidas Boost', price: 6000, variants: [] },
    ],
  },
};

const BASE_CTX = {
  state: 'PRODUCT_DISCOVERY',
  allowedIntents: ['PRODUCT_SEARCH', 'ORDER_CONFIRM'],
  allowedTools: ['searchProducts'],
  memory: {
    version: 1 as const,
    globalInformation: {},
    flows: [] as Flow[],
  },
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
    expect(prompt).toMatch(/Recent conversation transcript/);
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
    expect(prompt).not.toMatch(/Recent conversation transcript/);
  });

  it('reads product results from activeFlow when available', () => {
    const prompt = buildIntentPrompt({
      ...BASE_CTX,
      memory: { ...BASE_CTX.memory, flows: [activeFlow], activeFlow: 'f1' },
    });
    expect(prompt).toMatch(/Nike Air/);
    expect(prompt).toMatch(/Adidas Boost/);
    expect(prompt).toMatch(/Last product search results/);
  });

  it('falls back to memory.lastProductResults when no activeFlow', () => {
    const prompt = buildIntentPrompt({
      ...BASE_CTX,
      memory: {
        ...BASE_CTX.memory,
        lastProductResults: [{ id: 'p1', name: 'Fallback Product' }],
      } as never,
    });
    expect(prompt).toMatch(/Fallback Product/);
  });

  it('prefers activeFlow over memory.lastProductResults', () => {
    const prompt = buildIntentPrompt({
      ...BASE_CTX,
      memory: {
        ...BASE_CTX.memory,
        flows: [activeFlow],
        activeFlow: 'f1',
        lastProductResults: [{ id: 'p99', name: 'Old Memory Product' }],
      } as never,
    });
    expect(prompt).toMatch(/Nike Air/);
    const resultsSection = prompt.substring(prompt.indexOf('Last product search results (index'));
    expect(resultsSection).not.toMatch(/Old Memory Product/);
    expect(resultsSection).toMatch(/Nike Air/);
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
