import { describe, it, expect } from 'vitest';
import { classifyIntent, scoreFlow, resolveFlow, toFlowResolverEntities } from '../flowResolver';
import type { Flow, FlowProduct } from '../memory.types';
import type { FlowResolverInput, FlowResolverEntities } from '../flowResolver.types';
import type { IntentField } from '../schemas/intents.schemas';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const product = (name: string, id?: string): FlowProduct => ({
  productId: id ?? `pid-${name}`,
  productName: name,
  price: 1000,
  variants: [],
});

const discoveryFlow = (id: string, productName: string, results: FlowProduct[] = []): Flow => ({
  flowId: id,
  state: 'PRODUCT_DISCOVERY',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  productDiscovery: {
    input: { productName, filters: {} },
    toolResults: results,
  },
});

const selectedFlow = (id: string, productName: string): Flow => ({
  flowId: id,
  state: 'PRODUCT_SELECTED',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:01:00.000Z',
  productDiscovery: {
    input: { productName, filters: {} },
    toolResults: [product(productName)],
  },
});

const pendingFlow = (id: string, productName: string): Flow => ({
  flowId: id,
  state: 'ORDER_PENDING',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:02:00.000Z',
  productDiscovery: {
    input: { productName, filters: {} },
    toolResults: [product(productName)],
  },
  order: { orderId: 'order-1', productId: `pid-${productName}`, quantity: 1 },
});

const confirmedFlow = (id: string, productName: string): Flow => ({
  flowId: id,
  state: 'ORDER_CONFIRMED',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:03:00.000Z',
  productDiscovery: {
    input: { productName, filters: {} },
    toolResults: [product(productName)],
  },
  order: { orderId: 'order-1', productId: `pid-${productName}`, quantity: 1 },
  shipping: { method: 'Yalidine', cost: 600 },
});

function makeInput(
  intent: IntentField,
  entities: FlowResolverEntities = {},
  flows: Flow[] = [],
  activeFlowId: string | null = null,
): FlowResolverInput {
  return {
    extraction: { intent, entities, confidence: 0.9 },
    conversation: { activeFlowId, flows },
  };
}

// ---------------------------------------------------------------------------
// classifyIntent
// ---------------------------------------------------------------------------

describe('classifyIntent', () => {
  it('classifies ORDER_CREATE as STATE_INTENT', () => {
    expect(classifyIntent('ORDER_CREATE')).toBe('STATE_INTENT');
  });

  it('classifies ORDER_CONFIRM as STATE_INTENT', () => {
    expect(classifyIntent('ORDER_CONFIRM')).toBe('STATE_INTENT');
  });

  it('classifies ORDER_MODIFY as STATE_INTENT', () => {
    expect(classifyIntent('ORDER_MODIFY')).toBe('STATE_INTENT');
  });

  it('classifies ORDER_CANCEL as STATE_INTENT', () => {
    expect(classifyIntent('ORDER_CANCEL')).toBe('STATE_INTENT');
  });

  it('classifies PRODUCT_SEARCH as QUERY_INTENT', () => {
    expect(classifyIntent('PRODUCT_SEARCH')).toBe('QUERY_INTENT');
  });

  it('classifies PRODUCT_SELECT as QUERY_INTENT', () => {
    expect(classifyIntent('PRODUCT_SELECT')).toBe('QUERY_INTENT');
  });

  it('classifies PRODUCT_DETAILS as QUERY_INTENT', () => {
    expect(classifyIntent('PRODUCT_DETAILS')).toBe('QUERY_INTENT');
  });

  it('classifies PRODUCT_SUGGEST as QUERY_INTENT', () => {
    expect(classifyIntent('PRODUCT_SUGGEST')).toBe('QUERY_INTENT');
  });

  it('classifies SHIPPING_CHECK as QUERY_INTENT', () => {
    expect(classifyIntent('SHIPPING_CHECK')).toBe('QUERY_INTENT');
  });

  it('classifies STATUS_CHECK as QUERY_INTENT', () => {
    expect(classifyIntent('STATUS_CHECK')).toBe('QUERY_INTENT');
  });

  it('classifies ESCALATION as NO_FLOW_LOOKUP', () => {
    expect(classifyIntent('ESCALATION')).toBe('NO_FLOW_LOOKUP');
  });

  it('classifies OUT_OF_SCOPE as NO_FLOW_LOOKUP', () => {
    expect(classifyIntent('OUT_OF_SCOPE')).toBe('NO_FLOW_LOOKUP');
  });

  it('classifies GOODBYE as NO_FLOW_LOOKUP', () => {
    expect(classifyIntent('GOODBYE')).toBe('NO_FLOW_LOOKUP');
  });

  it('classifies suggested intent as NO_FLOW_LOOKUP', () => {
    expect(classifyIntent({ suggested: true, name: 'CUSTOM', description: 'test' })).toBe('NO_FLOW_LOOKUP');
  });
});

// ---------------------------------------------------------------------------
// scoreFlow
// ---------------------------------------------------------------------------

describe('scoreFlow', () => {
  it('gives higher score for explicit product match', () => {
    const flow = discoveryFlow('f1', 'nike shoes', [product('nike shoes')]);
    const matched = scoreFlow(flow, { productName: 'nike shoes' }, 'PRODUCT_SELECT');
    const unmatched = scoreFlow(flow, { productName: 'adidas jacket' }, 'PRODUCT_SELECT');

    expect(matched.score).toBeGreaterThan(unmatched.score);
    expect(matched.matchedSignals).toContain('explicitReference');
  });

  it('adds stateMatch score for compatible intent', () => {
    const flow = pendingFlow('f1', 'shoes');
    const compatible = scoreFlow(flow, {}, 'ORDER_CONFIRM');
    const incompatible = scoreFlow(flow, {}, 'PRODUCT_SEARCH');

    expect(compatible.matchedSignals).toContain('stateMatch');
    expect(incompatible.matchedSignals).not.toContain('stateMatch');
  });

  it('always includes recency signal', () => {
    const flow = discoveryFlow('f1', 'shoes');
    flow.updatedAt = new Date().toISOString();
    const scored = scoreFlow(flow, {}, 'PRODUCT_SEARCH');
    expect(scored.matchedSignals).toContain('recency');
  });

  it('generates summary from flow', () => {
    const flow = discoveryFlow('f1', 'shoes', [product('a'), product('b')]);
    const scored = scoreFlow(flow, {}, 'PRODUCT_SEARCH');
    expect(scored.summary).toBe('shoes (2 results)');
  });
});

// ---------------------------------------------------------------------------
// resolveFlow
// ---------------------------------------------------------------------------

describe('resolveFlow', () => {
  it('returns NO_FLOW_LOOKUP for ESCALATION', () => {
    const result = resolveFlow(makeInput('ESCALATION'));
    expect(result.action).toBe('NO_FLOW_LOOKUP');
  });

  it('returns NO_FLOW_LOOKUP for OUT_OF_SCOPE', () => {
    const result = resolveFlow(makeInput('OUT_OF_SCOPE'));
    expect(result.action).toBe('NO_FLOW_LOOKUP');
  });

  it('returns NO_FLOW_LOOKUP for GOODBYE', () => {
    const result = resolveFlow(makeInput('GOODBYE'));
    expect(result.action).toBe('NO_FLOW_LOOKUP');
  });

  it('returns NO_FLOW_LOOKUP for suggested intent', () => {
    const result = resolveFlow(makeInput({ suggested: true, name: 'X', description: 'y' }));
    expect(result.action).toBe('NO_FLOW_LOOKUP');
  });

  it('returns CREATE when no flows exist', () => {
    const result = resolveFlow(makeInput('PRODUCT_SEARCH', { productName: 'shoes' }));
    expect(result.action).toBe('CREATE');
    if (result.action === 'CREATE') {
      expect(result.productName).toBe('shoes');
    }
  });

  it('returns CREATE when no flows exist and no product name', () => {
    const result = resolveFlow(makeInput('PRODUCT_SEARCH', {}));
    expect(result.action).toBe('CREATE');
    if (result.action === 'CREATE') {
      expect(result.productName).toBe('unknown');
    }
  });

  describe('active flow exists', () => {
    it('CONTINUE for ORDER_CONFIRM on flow with order', () => {
      const flow = pendingFlow('f1', 'shoes');
      const result = resolveFlow(makeInput('ORDER_CONFIRM', {}, [flow], 'f1'));
      expect(result.action).toBe('CONTINUE');
      if (result.action === 'CONTINUE') {
        expect(result.flowId).toBe('f1');
      }
    });

    it('INVALID_ACTION for ORDER_CONFIRM on flow without order (no other flows)', () => {
      const flow = discoveryFlow('f1', 'shoes');
      const result = resolveFlow(makeInput('ORDER_CONFIRM', {}, [flow], 'f1'));
      expect(result.action).toBe('INVALID_ACTION');
    });

    it('INVALID_ACTION for ORDER_MODIFY on flow without order (no other flows)', () => {
      const flow = selectedFlow('f1', 'shoes');
      const result = resolveFlow(makeInput('ORDER_MODIFY', {}, [flow], 'f1'));
      expect(result.action).toBe('INVALID_ACTION');
    });

    it('INVALID_ACTION for ORDER_CANCEL on flow without order (no other flows)', () => {
      const flow = discoveryFlow('f1', 'shoes');
      const result = resolveFlow(makeInput('ORDER_CANCEL', {}, [flow], 'f1'));
      expect(result.action).toBe('INVALID_ACTION');
    });

    it('CREATE for PRODUCT_SEARCH while ORDER_PENDING', () => {
      const flow = pendingFlow('f1', 'shoes');
      const result = resolveFlow(makeInput('PRODUCT_SEARCH', { productName: 'phones' }, [flow], 'f1'));
      expect(result.action).toBe('CREATE');
    });

    it('CREATE for PRODUCT_SUGGEST while ORDER_CONFIRMED', () => {
      const flow = confirmedFlow('f1', 'shoes');
      const result = resolveFlow(makeInput('PRODUCT_SUGGEST', {}, [flow], 'f1'));
      expect(result.action).toBe('CREATE');
    });

    it('CONTINUE for PRODUCT_DETAILS on PRODUCT_DISCOVERY flow', () => {
      const flow = discoveryFlow('f1', 'shoes');
      const result = resolveFlow(makeInput('PRODUCT_DETAILS', {}, [flow], 'f1'));
      expect(result.action).toBe('CONTINUE');
    });

    it('CONTINUE for SHIPPING_CHECK on ORDER_CONFIRMED flow', () => {
      const flow = confirmedFlow('f1', 'shoes');
      const result = resolveFlow(makeInput('SHIPPING_CHECK', {}, [flow], 'f1'));
      expect(result.action).toBe('CONTINUE');
    });

    it('CONTINUE for STATUS_CHECK on ORDER_SHIPPED flow', () => {
      const flow: Flow = {
        flowId: 'f1',
        state: 'ORDER_SHIPPED',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:04:00.000Z',
        productDiscovery: { input: { productName: 'shoes', filters: {} }, toolResults: [] },
        order: { orderId: 'o1' },
        shipping: { method: 'Yalidine' },
      };
      const result = resolveFlow(makeInput('STATUS_CHECK', {}, [flow], 'f1'));
      expect(result.action).toBe('CONTINUE');
    });
  });

  describe('STATE_INTENT incompatible — switch to other flow', () => {
    it('SWITCH when ORDER_CREATE with productRef matches another flow', () => {
      const active = discoveryFlow('f1', 'jackets');
      const iphone = discoveryFlow('f2', 'iPhone 14 Pro Max', [product('iPhone 14 Pro Max')]);
      const result = resolveFlow(
        makeInput('ORDER_CREATE', { productName: 'iPhone 14 Pro Max' }, [active, iphone], 'f1'),
      );
      expect(result.action).toBe('SWITCH');
      if (result.action === 'SWITCH') {
        expect(result.flowId).toBe('f2');
      }
    });

    it('SWITCH when ORDER_CONFIRM with productRef matches another flow', () => {
      const active = discoveryFlow('f1', 'jackets');
      const shoes = pendingFlow('f2', 'nike shoes');
      const result = resolveFlow(
        makeInput('ORDER_CONFIRM', { productName: 'nike shoes' }, [active, shoes], 'f1'),
      );
      expect(result.action).toBe('SWITCH');
      if (result.action === 'SWITCH') {
        expect(result.flowId).toBe('f2');
      }
    });

    it('INVALID_ACTION when productRef does not match any other flow', () => {
      const active = discoveryFlow('f1', 'jackets');
      const result = resolveFlow(
        makeInput('ORDER_CREATE', { productName: 'unknown item' }, [active], 'f1'),
      );
      expect(result.action).toBe('INVALID_ACTION');
    });

    it('CLARIFY when productRef matches multiple other flows', () => {
      const active = discoveryFlow('f1', 'jackets');
      const shoes1 = discoveryFlow('f2', 'nike shoes', [product('nike shoes')]);
      const shoes2 = discoveryFlow('f3', 'adidas shoes', [product('adidas shoes')]);
      const result = resolveFlow(
        makeInput('ORDER_CREATE', { productName: 'shoes' }, [active, shoes1, shoes2], 'f1'),
      );
      // CLARIFY because multiple candidates have explicitReference
      expect(result.action).toBe('CLARIFY');
    });

    it('SWITCH when refersToPreviousFlow=true and recency matches another flow', () => {
      const active = discoveryFlow('f1', 'jackets');
      // iphone flow has no productRef in entities but is recent
      const iphone = discoveryFlow('f2', 'iPhone 14 Pro Max');
      iphone.updatedAt = new Date().toISOString();
      const result = resolveFlow(
        {
          extraction: { intent: 'ORDER_CREATE', entities: {}, confidence: 0.9 },
          conversation: { activeFlowId: 'f1', flows: [active, iphone] },
          refersToPreviousFlow: true,
        },
      );
      expect(result.action).toBe('SWITCH');
      if (result.action === 'SWITCH') {
        expect(result.flowId).toBe('f2');
      }
    });

    it('INVALID_ACTION when refersToPreviousFlow=false and no productRef matches', () => {
      const active = discoveryFlow('f1', 'jackets');
      const iphone = discoveryFlow('f2', 'iPhone 14 Pro Max');
      const result = resolveFlow(
        {
          extraction: { intent: 'ORDER_CREATE', entities: {}, confidence: 0.9 },
          conversation: { activeFlowId: 'f1', flows: [active, iphone] },
          refersToPreviousFlow: false,
        },
      );
      expect(result.action).toBe('INVALID_ACTION');
    });

    it('INVALID_ACTION when refersToPreviousFlow=true but no other flows exist', () => {
      const active = discoveryFlow('f1', 'jackets');
      const result = resolveFlow(
        {
          extraction: { intent: 'ORDER_CREATE', entities: {}, confidence: 0.9 },
          conversation: { activeFlowId: 'f1', flows: [active] },
          refersToPreviousFlow: true,
        },
      );
      expect(result.action).toBe('INVALID_ACTION');
    });
  });

  describe('no active flow, multiple flows', () => {
    it('SWITCH when one flow scores higher', () => {
      const f1 = discoveryFlow('f1', 'nike shoes', [product('nike shoes')]);
      const f2 = discoveryFlow('f2', 'adidas jacket', [product('adidas jacket')]);
      const result = resolveFlow(makeInput('PRODUCT_SEARCH', { productName: 'nike shoes' }, [f1, f2]));
      expect(result.action).toBe('SWITCH');
      if (result.action === 'SWITCH') {
        expect(result.flowId).toBe('f1');
      }
    });

    it('CREATE when no flow scores above recency-only', () => {
      const f1 = discoveryFlow('f1', 'shoes');
      const result = resolveFlow(makeInput('PRODUCT_SEARCH', { productName: 'completely unrelated' }, [f1]));
      expect(result.action).toBe('CREATE');
    });
  });

  describe('QUERY_INTENT with product reference', () => {
    it('CONTINUE when product matches active flow', () => {
      const flow = discoveryFlow('f1', 'shoes', [product('shoes')]);
      const result = resolveFlow(makeInput('PRODUCT_DETAILS', { productName: 'shoes' }, [flow], 'f1'));
      expect(result.action).toBe('CONTINUE');
    });

    it('SWITCH when product matches non-active flow', () => {
      const f1 = discoveryFlow('f1', 'shoes', [product('shoes')]);
      const f2 = discoveryFlow('f2', 'jackets', [product('jackets')]);
      const result = resolveFlow(makeInput('PRODUCT_DETAILS', { productName: 'jackets' }, [f1, f2], 'f1'));
      expect(result.action).toBe('SWITCH');
      if (result.action === 'SWITCH') {
        expect(result.flowId).toBe('f2');
      }
    });

    it('CREATE when product matches nothing', () => {
      const flow = discoveryFlow('f1', 'shoes');
      const result = resolveFlow(makeInput('PRODUCT_DETAILS', { productName: 'laptops' }, [flow], 'f1'));
      expect(result.action).toBe('CREATE');
    });
  });

  describe('QUERY_INTENT without product reference', () => {
    it('CONTINUE when active flow has order', () => {
      const flow = pendingFlow('f1', 'shoes');
      const result = resolveFlow(makeInput('SHIPPING_CHECK', {}, [flow], 'f1'));
      expect(result.action).toBe('CONTINUE');
    });

    it('CONTINUE when no order and no product ref — active flow exists', () => {
      const flow = discoveryFlow('f1', 'shoes');
      const result = resolveFlow(makeInput('SHIPPING_CHECK', {}, [flow], 'f1'));
      expect(result.action).toBe('CONTINUE');
    });
  });

  describe('activeFlowId references missing flow', () => {
    it('SWITCH when activeFlowId points to non-existent flow but another flow matches product', () => {
      const flow = discoveryFlow('f1', 'shoes');
      const result = resolveFlow(makeInput('PRODUCT_SEARCH', { productName: 'shoes' }, [flow], 'nonexistent'));
      expect(result.action).toBe('SWITCH');
      if (result.action === 'SWITCH') {
        expect(result.flowId).toBe('f1');
      }
    });

    it('CREATE when activeFlowId is stale and no flow matches product', () => {
      const flow = discoveryFlow('f1', 'jackets');
      const result = resolveFlow(makeInput('PRODUCT_SEARCH', { productName: 'shoes' }, [flow], 'nonexistent'));
      expect(result.action).toBe('CREATE');
    });
  });
});

// ---------------------------------------------------------------------------
// toFlowResolverEntities
// ---------------------------------------------------------------------------

describe('toFlowResolverEntities', () => {
  it('maps product to productName and productRef', () => {
    const result = toFlowResolverEntities({ product: 'nike shoes' });
    expect(result.productName).toBe('nike shoes');
    expect(result.productRef).toBe('nike shoes');
  });

  it('prefers explicit productName/productRef over product', () => {
    const result = toFlowResolverEntities({
      product: 'generic',
      productName: 'specific name',
      productRef: 'ref name',
    });
    expect(result.productName).toBe('specific name');
    expect(result.productRef).toBe('ref name');
  });

  it('maps wilaya, commune, quantity, orderId, orderRef, reason', () => {
    const result = toFlowResolverEntities({
      product: 'shoes',
      wilaya: 'Casablanca',
      commune: 'Hay Mohammadi',
      quantity: 3,
      orderId: 'ord-123',
      orderRef: 'ref-456',
      reason: 'too expensive',
    });
    expect(result.wilaya).toBe('Casablanca');
    expect(result.commune).toBe('Hay Mohammadi');
    expect(result.quantity).toBe(3);
    expect(result.orderId).toBe('ord-123');
    expect(result.orderRef).toBe('ref-456');
    expect(result.reason).toBe('too expensive');
  });

  it('returns undefined for missing fields', () => {
    const result = toFlowResolverEntities({});
    expect(result.productName).toBeUndefined();
    expect(result.productRef).toBeUndefined();
    expect(result.wilaya).toBeUndefined();
    expect(result.commune).toBeUndefined();
    expect(result.quantity).toBeUndefined();
    expect(result.orderId).toBeUndefined();
    expect(result.orderRef).toBeUndefined();
    expect(result.reason).toBeUndefined();
  });

  it('handles non-number quantity gracefully', () => {
    const result = toFlowResolverEntities({ quantity: 'abc' as unknown as number });
    expect(result.quantity).toBeUndefined();
  });

  it('passes through numeric quantity', () => {
    const result = toFlowResolverEntities({ quantity: 5 });
    expect(result.quantity).toBe(5);
  });
});
