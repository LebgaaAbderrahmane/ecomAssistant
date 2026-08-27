import { describe, it, expect } from 'vitest';
import { getFlowOrderId, getFlowCurrentProductId, getFlowSelectedProductId, getFlowProductResults } from '../flowExtractors';
import type { Flow } from '../memory.types';

const IDLE: Flow = {
  flowId: 'f1',
  state: 'IDLE',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const PRODUCT_DISCOVERY: Flow = {
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

const PRODUCT_SELECTED: Flow = {
  flowId: 'f1',
  state: 'PRODUCT_SELECTED',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  currentProductId: 'p1',
  productDiscovery: {
    input: { productName: 'shoes', filters: {} },
    toolResults: [
      { productId: 'p1', productName: 'Nike Air', price: 5000, variants: [] },
    ],
  },
};

const ORDER_PENDING: Flow = {
  flowId: 'f1',
  state: 'ORDER_PENDING',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  currentProductId: 'p1',
  productDiscovery: {
    input: { productName: 'shoes', filters: {} },
    toolResults: [],
  },
  order: { orderId: 'o1', productId: 'p1', quantity: 2 },
};

describe('getFlowOrderId', () => {
  it('returns undefined for null', () => {
    expect(getFlowOrderId(null)).toBeUndefined();
  });

  it('returns undefined for IDLE', () => {
    expect(getFlowOrderId(IDLE)).toBeUndefined();
  });

  it('returns undefined for PRODUCT_DISCOVERY', () => {
    expect(getFlowOrderId(PRODUCT_DISCOVERY)).toBeUndefined();
  });

  it('returns orderId for ORDER_PENDING', () => {
    expect(getFlowOrderId(ORDER_PENDING)).toBe('o1');
  });
});

describe('getFlowCurrentProductId', () => {
  it('returns undefined for null', () => {
    expect(getFlowCurrentProductId(null)).toBeUndefined();
  });

  it('returns undefined for IDLE', () => {
    expect(getFlowCurrentProductId(IDLE)).toBeUndefined();
  });

  it('returns undefined for PRODUCT_DISCOVERY (no selection yet)', () => {
    expect(getFlowCurrentProductId(PRODUCT_DISCOVERY)).toBeUndefined();
  });

  it('returns currentProductId for PRODUCT_SELECTED', () => {
    expect(getFlowCurrentProductId(PRODUCT_SELECTED)).toBe('p1');
  });

  it('returns currentProductId for ORDER_PENDING', () => {
    expect(getFlowCurrentProductId(ORDER_PENDING)).toBe('p1');
  });

  it('returns undefined for PRODUCT_SELECTED without currentProductId', () => {
    const flow: Flow = {
      ...PRODUCT_SELECTED,
      currentProductId: undefined,
    };
    expect(getFlowCurrentProductId(flow)).toBeUndefined();
  });
});

describe('getFlowSelectedProductId (deprecated alias)', () => {
  it('delegates to getFlowCurrentProductId', () => {
    expect(getFlowSelectedProductId(PRODUCT_SELECTED)).toBe('p1');
    expect(getFlowSelectedProductId(null)).toBeUndefined();
  });
});

describe('getFlowProductResults', () => {
  it('returns undefined for null', () => {
    expect(getFlowProductResults(null)).toBeUndefined();
  });

  it('returns undefined for IDLE', () => {
    expect(getFlowProductResults(IDLE)).toBeUndefined();
  });

  it('returns mapped results for PRODUCT_DISCOVERY', () => {
    const results = getFlowProductResults(PRODUCT_DISCOVERY);
    expect(results).toEqual([
      { id: 'p1', name: 'Nike Air' },
      { id: 'p2', name: 'Adidas Boost' },
    ]);
  });

  it('returns empty array for ORDER_PENDING with no results', () => {
    expect(getFlowProductResults(ORDER_PENDING)).toEqual([]);
  });
});
