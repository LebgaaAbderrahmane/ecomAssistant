import { describe, it, expect } from 'vitest';
import {
  migrateMemory,
  getActiveFlow,
  findFlowById,
} from '../flowHelper';
import { CURRENT_MEMORY_VERSION } from '../memory.types';
import type { ConversationMemory, Flow } from '../memory.types';

const discoveryFlow = (id: string): Flow => ({
  flowId: id,
  state: 'PRODUCT_DISCOVERY',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  productDiscovery: {
    input: { productName: 'shoes', filters: {} },
    toolResults: [],
  },
});

const pendingFlow = (id: string): Flow => ({
  flowId: id,
  state: 'ORDER_PENDING',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  productDiscovery: {
    input: { productName: 'shoes', filters: {} },
    toolResults: [],
  },
  order: { orderId: 'order-1', productId: 'p1', quantity: 1 },
});

const makeMemory = (flows: Flow[] = [], activeFlow?: string): ConversationMemory => ({
  version: CURRENT_MEMORY_VERSION,
  globalInformation: {},
  flows,
  activeFlow,
});

describe('migrateMemory', () => {
  it('returns empty structure for null input', () => {
    const result = migrateMemory(null);
    expect(result).toEqual({ version: 1, globalInformation: {}, flows: [] });
  });

  it('returns empty structure for undefined input', () => {
    const result = migrateMemory(undefined);
    expect(result).toEqual({ version: 1, globalInformation: {}, flows: [] });
  });

  it('returns empty structure for empty object', () => {
    const result = migrateMemory({});
    expect(result).toEqual({ version: 1, globalInformation: {}, flows: [] });
  });

  it('returns empty structure for arbitrary unknown shape', () => {
    const result = migrateMemory('just a string');
    expect(result).toEqual({ version: 1, globalInformation: {}, flows: [] });
  });

  it('extracts wilaya from legacy entities', () => {
    const result = migrateMemory({ entities: { wilaya: 'Oran' } });
    expect(result.globalInformation.wilaya).toBe('Oran');
  });

  it('extracts commune from legacy entities', () => {
    const result = migrateMemory({ entities: { commune: 'Bir El Djir' } });
    expect(result.globalInformation.commune).toBe('Bir El Djir');
  });

  it('extracts customerName from legacy entities', () => {
    const result = migrateMemory({ customerName: 'Ahmed' });
    expect(result.globalInformation.customerName).toBe('Ahmed');
  });

  it('preserves recentIntents from legacy shape', () => {
    const result = migrateMemory({
      recentIntents: ['PRODUCT_SEARCH', 'PRODUCT_SELECT'],
    });
    expect(result.recentIntents).toEqual(['PRODUCT_SEARCH', 'PRODUCT_SELECT']);
  });

  it('returns as-is when version matches and keys present', () => {
    const migrated = makeMemory();
    const result = migrateMemory(migrated);
    expect(result).toBe(migrated);
  });

  it('returns empty flows array for legacy shape', () => {
    const result = migrateMemory({
      lastIntent: 'PRODUCT_SEARCH',
      entities: { wilaya: 'Tlemcen' },
    });
    expect(result.flows).toEqual([]);
    expect(result.activeFlow).toBeUndefined();
  });

  it('sets version to CURRENT_MEMORY_VERSION on migrated data', () => {
    const result = migrateMemory({ entities: {} });
    expect(result.version).toBe(CURRENT_MEMORY_VERSION);
  });

  it('throws on unrecognized version number', () => {
    expect(() => migrateMemory({ version: 999 })).toThrow('unrecognized memory shape');
  });
});

describe('getActiveFlow', () => {
  it('returns flow matching activeFlow id', () => {
    const f1 = discoveryFlow('f1');
    const f2 = discoveryFlow('f2');
    const memory = makeMemory([f1, f2], 'f1');
    expect(getActiveFlow(memory)).toBe(f1);
  });

  it('returns undefined when activeFlow is undefined', () => {
    const memory = makeMemory([discoveryFlow('f1')]);
    expect(getActiveFlow(memory)).toBeUndefined();
  });

  it('returns undefined when activeFlow id matches no flow', () => {
    const memory = makeMemory([discoveryFlow('f1')], 'nonexistent');
    expect(getActiveFlow(memory)).toBeUndefined();
  });
});

describe('findFlowById', () => {
  it('returns flow when id matches', () => {
    const f1 = pendingFlow('f1');
    const f2 = pendingFlow('f2');
    const memory = makeMemory([f1, f2]);
    expect(findFlowById(memory, 'f2')).toBe(f2);
  });

  it('returns undefined when id not found', () => {
    const memory = makeMemory([pendingFlow('f1')]);
    expect(findFlowById(memory, 'missing')).toBeUndefined();
  });
});
