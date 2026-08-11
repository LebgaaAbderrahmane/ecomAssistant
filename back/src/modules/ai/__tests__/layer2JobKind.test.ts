import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
});

describe('decideLayer2JobKind', () => {
  it('returns generate-response for write-only intents', () => {
    assert.equal(decideLayer2JobKind([item('ORDER_CREATE')]), 'generate-response');
    assert.equal(decideLayer2JobKind([item('ORDER_CONFIRM'), item('ORDER_CANCEL')]), 'generate-response');
  });

  it('returns generate-response for intents with no resolvable tool', () => {
    assert.equal(decideLayer2JobKind([item('OUT_OF_SCOPE')]), 'generate-response');
  });

  it('returns execute-read-tools when any intent resolves to a read tool', () => {
    assert.equal(
      decideLayer2JobKind([item('PRODUCT_SEARCH', { product: 'chaussures' })]),
      'execute-read-tools',
    );
    assert.equal(
      decideLayer2JobKind([item('PRODUCT_DETAILS')]),
      'execute-read-tools',
    );
  });

  it('returns execute-read-tools for a mix of write and read intents', () => {
    assert.equal(
      decideLayer2JobKind([item('ORDER_CREATE'), item('PRODUCT_DETAILS')]),
      'execute-read-tools',
    );
  });
});
