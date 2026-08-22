import { describe, it, expect } from 'vitest';
import {
  consolidatePreferences,
  computeExclusionIds,
  buildProductWhere,
} from '../tools/suggestionHelpers';
import type { ConversationMemory } from '../memory.types';

const baseMemory: ConversationMemory = {
  entities: { category: 'shoes', color: 'black', maxPrice: 8000 },
  lastProductResults: [{ id: 'p1', name: 'Nike A' }],
  rejectedProducts: [{ id: 'p2', name: 'Adidas B' }],
};

describe('consolidatePreferences', () => {
  it('merges current-message entities with memory entities', () => {
    const prefs = consolidatePreferences({ size: '42' }, baseMemory);
    expect(prefs.category).toBe('shoes');
    expect(prefs.color).toBe('black');
    expect(prefs.size).toBe('42');
    expect(prefs.maxPrice).toBe(8000);
  });

  it('message values win over memory values', () => {
    const prefs = consolidatePreferences({ color: 'blue', maxPrice: 5000 }, baseMemory);
    expect(prefs.color).toBe('blue');
    expect(prefs.maxPrice).toBe(5000);
  });

  it('collects preference terms for ranking', () => {
    const prefs = consolidatePreferences(
      { product: 'sneakers', preferences: 'running' },
      { entities: { category: 'shoes', color: 'black', size: '42' } },
    );
    expect(prefs.terms).toEqual(['shoes', 'black', '42', 'sneakers', 'running']);
  });

  it('parses string numbers for price bounds', () => {
    const prefs = consolidatePreferences({ maxPrice: '8000' }, {});
    expect(prefs.maxPrice).toBe(8000);
  });

  it('returns empty preferences with no signals', () => {
    const prefs = consolidatePreferences({}, {});
    expect(prefs.terms).toEqual([]);
    expect(prefs.category).toBeUndefined();
  });
});

describe('computeExclusionIds', () => {
  it('dedupes lastProductResults + rejectedProducts + currentProductId', () => {
    const ids = computeExclusionIds(
      {
        lastProductResults: [{ id: 'p1', name: 'A' }, { id: 'p3', name: 'C' }],
        rejectedProducts: [{ id: 'p2', name: 'B' }],
      },
      'p1',
    );
    expect(new Set(ids)).toEqual(new Set(['p1', 'p2', 'p3']));
  });

  it('handles empty memory', () => {
    expect(computeExclusionIds({})).toEqual([]);
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
    expect(where.merchantId).toBe('m1');
    expect(where.agentEnabled).toBe(true);
    expect(where.id).toEqual({ notIn: ['p1'] });
    const and = where.AND as Array<Record<string, unknown>>;
    expect(Array.isArray(and)).toBeTruthy();
    const priceClause = and.find((c) => (c as { price?: unknown }).price) as { price: { gte: number; lte: number } };
    expect(priceClause.price).toEqual({ gte: 1000, lte: 8000 });
  });

  it('adds keyword term clauses to the AND group', () => {
    const where = buildProductWhere(filter);
    const and = where.AND as Array<Record<string, unknown>>;
    const termClause = and.find((c) => (c as { AND?: unknown }).AND) as { AND: unknown[] };
    expect(termClause.AND.length).toBe(2);
  });

  it('does not build AND when there are no filters', () => {
    const where = buildProductWhere({ merchantId: 'm1', terms: [], excludeIds: [] });
    expect(where.AND).toBeUndefined();
    expect(where.id).toBeUndefined();
  });
});
