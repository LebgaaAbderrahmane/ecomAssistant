import { describe, it, expect } from 'vitest';
import {
  consolidatePreferences,
  computeExclusionIds,
  buildProductWhere,
} from '../tools/suggestionHelpers';
import type { ConversationMemory, Flow, FlowFilter } from '../memory.types';

const baseMemory: ConversationMemory = {
  version: 1,
  globalInformation: { wilaya: 'Alger' },
  flows: [],
};

const baseFilter: FlowFilter = {
  category: 'shoes',
  color: 'black',
  size: '42',
  maxPrice: 8000,
};

describe('consolidatePreferences', () => {
  it('merges message entities with flow filter', () => {
    const prefs = consolidatePreferences({ size: '44' }, baseFilter);
    expect(prefs.category).toBe('shoes');
    expect(prefs.color).toBe('black');
    expect(prefs.size).toBe('44');
    expect(prefs.maxPrice).toBe(8000);
  });

  it('message entities win over flow filter', () => {
    const prefs = consolidatePreferences({ color: 'blue', maxPrice: 5000 }, baseFilter);
    expect(prefs.color).toBe('blue');
    expect(prefs.maxPrice).toBe(5000);
  });

  it('collects preference terms for ranking', () => {
    const prefs = consolidatePreferences(
      { product: 'sneakers', preferences: 'running' },
      { category: 'shoes', color: 'black', size: '42' },
    );
    expect(prefs.terms).toEqual(['shoes', 'black', '42', 'sneakers', 'running']);
  });

  it('includes freeText from flow filter in terms', () => {
    const prefs = consolidatePreferences({}, { freeText: 'basketball shoes' });
    expect(prefs.terms).toContain('basketball shoes');
  });

  it('parses string numbers for price bounds', () => {
    const prefs = consolidatePreferences({ maxPrice: '8000' });
    expect(prefs.maxPrice).toBe(8000);
  });

  it('returns empty preferences with no signals', () => {
    const prefs = consolidatePreferences({});
    expect(prefs.terms).toEqual([]);
    expect(prefs.category).toBeUndefined();
  });

  it('works with no flow filter', () => {
    const prefs = consolidatePreferences({ category: 'hats' });
    expect(prefs.category).toBe('hats');
    expect(prefs.terms).toEqual(['hats']);
  });
});

describe('computeExclusionIds', () => {
  it('dedupes toolResults + rejectedProductIds + currentProductId', () => {
    const flow: Flow = {
      flowId: 'f1',
      state: 'PRODUCT_DISCOVERY',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      productDiscovery: {
        input: { productName: 'shoes', filters: {} },
        toolResults: [
          { productId: 'p1', productName: 'A', price: 1000, variants: [] },
          { productId: 'p3', productName: 'C', price: 1000, variants: [] },
        ],
        rejectedProductIds: ['p2'],
      },
    };
    const ids = computeExclusionIds(flow, 'p1');
    expect(new Set(ids)).toEqual(new Set(['p1', 'p2', 'p3']));
  });

  it('handles IDLE flow', () => {
    const flow: Flow = {
      flowId: 'idle',
      state: 'IDLE',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    expect(computeExclusionIds(flow)).toEqual([]);
  });

  it('handles flow with no toolResults or rejectedProductIds', () => {
    const flow: Flow = {
      flowId: 'f1',
      state: 'PRODUCT_DISCOVERY',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      productDiscovery: {
        input: { productName: 'shoes', filters: {} },
        toolResults: [],
      },
    };
    expect(computeExclusionIds(flow)).toEqual([]);
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
