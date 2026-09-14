import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSuggestionPreferences,
  memoryExclusionIds,
  buildProductWhere,
} from '../tools/suggestionHelpers';
import type { ConversationMemory } from '../memory.types';

const baseMemory: ConversationMemory = {
  lastProductResults: [{ id: 'p1', name: 'Nike A' }],
  rejectedProducts: [{ id: 'p2', name: 'Adidas B' }],
};

describe('buildSuggestionPreferences', () => {
  it('builds preferences from explicit message entities', () => {
    const prefs = buildSuggestionPreferences({ category: 'shoes', color: 'black', size: '42', maxPrice: 8000 });
    assert.equal(prefs.category, 'shoes');
    assert.equal(prefs.color, 'black');
    assert.equal(prefs.size, '42');
    assert.equal(prefs.maxPrice, 8000);
  });

  it('message values stand alone — no memory fallback', () => {
    const prefs = buildSuggestionPreferences({ color: 'blue', maxPrice: 5000 });
    assert.equal(prefs.color, 'blue');
    assert.equal(prefs.maxPrice, 5000);
    assert.equal(prefs.category, undefined);
  });

  it('collects preference terms for ranking', () => {
    const prefs = buildSuggestionPreferences({ category: 'shoes', color: 'black', size: '42', preferences: 'running' });
    assert.deepEqual(prefs.terms, ['shoes', 'black', '42', 'running']);
  });

  it('parses string numbers for price bounds', () => {
    const prefs = buildSuggestionPreferences({ maxPrice: '8000' });
    assert.equal(prefs.maxPrice, 8000);
  });

  it('returns empty preferences with no signals', () => {
    const prefs = buildSuggestionPreferences({});
    assert.deepEqual(prefs.terms, []);
    assert.equal(prefs.category, undefined);
  });
});

describe('memoryExclusionIds', () => {
  it('dedupes lastProductResults + rejectedProducts + currentProductId', () => {
    const ids = memoryExclusionIds(
      {
        lastProductResults: [{ id: 'p1', name: 'A' }, { id: 'p3', name: 'C' }],
        rejectedProducts: [{ id: 'p2', name: 'B' }],
      },
      'p1',
    );
    assert.deepEqual(new Set(ids), new Set(['p1', 'p2', 'p3']));
  });

  it('handles empty memory', () => {
    assert.deepEqual(memoryExclusionIds({}), []);
  });
});

describe('buildProductWhere', () => {
  const filter = {
    merchantId: 'm1',
    category: 'shoes',
    color: 'black',
    size: '42',
    minPrice: 1000,
    maxPrice: 8000,
    terms: ['shoes', 'black'],
    excludeIds: ['p1'],
  };

  it('narrows by merchant, agent-enabled, price and excludes rejected ids', () => {
    const where = buildProductWhere(filter);
    assert.equal(where.merchantId, 'm1');
    assert.equal(where.agentEnabled, true);
    assert.deepEqual(where.id, { notIn: ['p1'] });
    const and = where.AND as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(and));
    const priceClause = and.find((c) => (c as { price?: unknown }).price) as { price: { gte: number; lte: number } };
    assert.deepEqual(priceClause.price, { gte: 1000, lte: 8000 });
  });

  it('adds keyword term clauses to the AND group', () => {
    const where = buildProductWhere(filter);
    const and = where.AND as Array<Record<string, unknown>>;
    const termClause = and.find((c) => (c as { AND?: unknown }).AND) as { AND: unknown[] };
    assert.equal(termClause.AND.length, 2);
  });

  it('does not build AND when there are no filters', () => {
    const where = buildProductWhere({ merchantId: 'm1', terms: [], excludeIds: [] });
    assert.equal(where.AND, undefined);
    assert.equal(where.id, undefined);
  });
});
