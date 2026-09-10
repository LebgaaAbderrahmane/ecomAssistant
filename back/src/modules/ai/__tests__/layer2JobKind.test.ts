import { describe, it, expect } from 'vitest';
import { decideLayer2JobKind } from '../layer2JobKind';
import type { IntentItem } from '../schemas/ai.schemas';

const item = (intent: IntentItem['intent'], entities: IntentItem['entities'] = {}): IntentItem => ({
  intent,
  entities,
  confidence: 0.9,
  order: 1,
  status: 'resolved',
  candidates: null,
  unresolvedReason: null,
  details: [],
});

describe('decideLayer2JobKind', () => {
  it('returns generate-response for write-only intents', () => {
    expect(decideLayer2JobKind([item('ORDER_CREATE')])).toBe('generate-response');
    expect(decideLayer2JobKind([item('ORDER_CONFIRM'), item('ORDER_CANCEL')])).toBe('generate-response');
  });

  it('returns generate-response for intents with no resolvable tool', () => {
    expect(decideLayer2JobKind([item('OUT_OF_SCOPE')])).toBe('generate-response');
  });

  it('returns execute-read-tools when any intent resolves to a read tool', () => {
    expect(
      decideLayer2JobKind([item('PRODUCT_SEARCH', { product: 'chaussures' })]),
    ).toBe('execute-read-tools');
    expect(
      decideLayer2JobKind([item('PRODUCT_DETAILS')]),
    ).toBe('execute-read-tools');
  });

  it('returns execute-read-tools for a mix of write and read intents', () => {
    expect(
      decideLayer2JobKind([item('ORDER_CREATE'), item('PRODUCT_DETAILS')]),
    ).toBe('execute-read-tools');
  });
});
