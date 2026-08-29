import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TOOL_FLOW_STATE_MAP,
  transitionState,
  recordProductResults,
  clearProductResults,
  recordOrder,
  applyToolResult,
  persistFlowMemory,
} from '../flow/flowProcessor';
import type { Flow, FlowProduct, ConversationMemory } from '../memory.types';

// ---------------------------------------------------------------------------
// Mock prisma
// ---------------------------------------------------------------------------

const updateMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../config/db.config', () => ({
  default: { conversation: { update: (...args: unknown[]) => updateMock(...args) } },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const product = (name: string, id?: string): FlowProduct => ({
  productId: id ?? `pid-${name}`,
  productName: name,
  price: 1000,
  variants: [],
});

const discoveryFlow = (id = 'f1', name = 'shoes'): Flow => ({
  flowId: id,
  state: 'PRODUCT_DISCOVERY',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  productDiscovery: {
    input: { productName: name, filters: {} },
    toolResults: [],
  },
});

const selectedFlow = (id = 'f1', name = 'shoes'): Flow => ({
  flowId: id,
  state: 'PRODUCT_SELECTED',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:01:00.000Z',
  productDiscovery: {
    input: { productName: name, filters: {} },
    toolResults: [product(name)],
  },
});

const pendingFlow = (id = 'f1', name = 'shoes'): Flow => ({
  flowId: id,
  state: 'ORDER_PENDING',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:02:00.000Z',
  productDiscovery: {
    input: { productName: name, filters: {} },
    toolResults: [product(name)],
  },
  order: { orderId: 'order-1', productId: `pid-${name}`, quantity: 1 },
});

const idleFlow: Flow = {
  flowId: 'idle-1',
  state: 'IDLE',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// TOOL_FLOW_STATE_MAP
// ---------------------------------------------------------------------------

describe('TOOL_FLOW_STATE_MAP', () => {
  it('maps searchProducts to PRODUCT_DISCOVERY', () => {
    expect(TOOL_FLOW_STATE_MAP.searchProducts).toBe('PRODUCT_DISCOVERY');
  });

  it('maps recallPreviousProducts to PRODUCT_DISCOVERY', () => {
    expect(TOOL_FLOW_STATE_MAP.recallPreviousProducts).toBe('PRODUCT_DISCOVERY');
  });

  it('maps suggestProducts to PRODUCT_DISCOVERY', () => {
    expect(TOOL_FLOW_STATE_MAP.suggestProducts).toBe('PRODUCT_DISCOVERY');
  });

  it('maps selectProduct to PRODUCT_SELECTED', () => {
    expect(TOOL_FLOW_STATE_MAP.selectProduct).toBe('PRODUCT_SELECTED');
  });

  it('maps getProductDetails to PRODUCT_SELECTED', () => {
    expect(TOOL_FLOW_STATE_MAP.getProductDetails).toBe('PRODUCT_SELECTED');
  });

  it('maps createOrder to ORDER_PENDING', () => {
    expect(TOOL_FLOW_STATE_MAP.createOrder).toBe('ORDER_PENDING');
  });

  it('maps confirmOrder to ORDER_CONFIRMED', () => {
    expect(TOOL_FLOW_STATE_MAP.confirmOrder).toBe('ORDER_CONFIRMED');
  });

  it('maps cancelOrder to ORDER_CANCELLED', () => {
    expect(TOOL_FLOW_STATE_MAP.cancelOrder).toBe('ORDER_CANCELLED');
  });

  it('does not map getOrderStatus (read-only query)', () => {
    expect(TOOL_FLOW_STATE_MAP.getOrderStatus).toBeUndefined();
  });

  it('does not map calculateShipping (read-only query)', () => {
    expect(TOOL_FLOW_STATE_MAP.calculateShipping).toBeUndefined();
  });

  it('does not map escalateConversation (support)', () => {
    expect(TOOL_FLOW_STATE_MAP.escalateConversation).toBeUndefined();
  });

  it('does not map modifyOrder (data-only, no state change)', () => {
    expect(TOOL_FLOW_STATE_MAP.modifyOrder).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// transitionState
// ---------------------------------------------------------------------------

describe('transitionState', () => {
  it('returns target state on success', () => {
    expect(transitionState('PRODUCT_DISCOVERY', 'searchProducts', true)).toBe('PRODUCT_DISCOVERY');
  });

  it('returns current state on failure', () => {
    expect(transitionState('PRODUCT_SELECTED', 'createOrder', false)).toBe('PRODUCT_SELECTED');
  });

  it('returns current state for unmapped tool', () => {
    expect(transitionState('PRODUCT_DISCOVERY', 'getOrderStatus', true)).toBe('PRODUCT_DISCOVERY');
  });

  it('transitions PRODUCT_SELECTED → ORDER_PENDING on createOrder success', () => {
    expect(transitionState('PRODUCT_SELECTED', 'createOrder', true)).toBe('ORDER_PENDING');
  });

  it('transitions ORDER_PENDING → ORDER_CONFIRMED on confirmOrder success', () => {
    expect(transitionState('ORDER_PENDING', 'confirmOrder', true)).toBe('ORDER_CONFIRMED');
  });

  it('transitions ORDER_PENDING → ORDER_CANCELLED on cancelOrder success', () => {
    expect(transitionState('ORDER_PENDING', 'cancelOrder', true)).toBe('ORDER_CANCELLED');
  });

  it('transitions PRODUCT_DISCOVERY → PRODUCT_SELECTED on selectProduct success', () => {
    expect(transitionState('PRODUCT_DISCOVERY', 'selectProduct', true)).toBe('PRODUCT_SELECTED');
  });
});

// ---------------------------------------------------------------------------
// recordProductResults
// ---------------------------------------------------------------------------

describe('recordProductResults', () => {
  it('appends products to toolResults', () => {
    const flow = discoveryFlow();
    const result = recordProductResults(flow, [product('a'), product('b')]);
    expect(result.state).toBe('PRODUCT_DISCOVERY');
    if (result.state === 'PRODUCT_DISCOVERY') {
      expect(result.productDiscovery.toolResults).toHaveLength(2);
    }
  });

  it('preserves existing toolResults', () => {
    const flow = discoveryFlow();
    const withOne = recordProductResults(flow, [product('a')]);
    const withTwo = recordProductResults(withOne, [product('b')]);
    if (withTwo.state === 'PRODUCT_DISCOVERY') {
      expect(withTwo.productDiscovery.toolResults).toHaveLength(2);
    }
  });

  it('updates updatedAt', () => {
    const flow = discoveryFlow();
    const result = recordProductResults(flow, [product('a')]);
    expect(result.updatedAt).not.toBe('2025-01-01T00:00:00.000Z');
  });

  it('returns flow unchanged for IDLE', () => {
    const result = recordProductResults(idleFlow, [product('a')]);
    expect(result).toEqual(idleFlow);
  });

  it('works on ORDER_PENDING flow', () => {
    const flow = pendingFlow();
    const result = recordProductResults(flow, [product('new')]);
    if (result.state === 'ORDER_PENDING') {
      expect(result.productDiscovery.toolResults).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// clearProductResults
// ---------------------------------------------------------------------------

describe('clearProductResults', () => {
  it('empties toolResults', () => {
    const flow = discoveryFlow();
    const withProducts = recordProductResults(flow, [product('a')]);
    const cleared = clearProductResults(withProducts);
    if (cleared.state === 'PRODUCT_DISCOVERY') {
      expect(cleared.productDiscovery.toolResults).toHaveLength(0);
    }
  });

  it('returns flow unchanged for IDLE', () => {
    expect(clearProductResults(idleFlow)).toEqual(idleFlow);
  });
});

// ---------------------------------------------------------------------------
// recordOrder
// ---------------------------------------------------------------------------

describe('recordOrder', () => {
  it('sets orderId on ORDER_PENDING flow', () => {
    const flow: Flow = {
      flowId: 'f1',
      state: 'ORDER_PENDING',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      productDiscovery: { input: { productName: 'shoes', filters: {} }, toolResults: [] },
      order: {},
    };
    const result = recordOrder(flow, 'order-123');
    if (result.state === 'ORDER_PENDING') {
      expect(result.order.orderId).toBe('order-123');
    }
  });

  it('updates productId and quantity', () => {
    const flow = pendingFlow();
    const result = recordOrder(flow, 'order-1', 'pid-new', 3);
    if (result.state === 'ORDER_PENDING') {
      expect(result.order.productId).toBe('pid-new');
      expect(result.order.quantity).toBe(3);
    }
  });

  it('preserves existing order fields', () => {
    const flow = pendingFlow();
    const result = recordOrder(flow, 'order-2');
    if (result.state === 'ORDER_PENDING') {
      expect(result.order.productId).toBe('pid-shoes');
      expect(result.order.quantity).toBe(1);
    }
  });

  it('returns flow unchanged for PRODUCT_DISCOVERY', () => {
    const flow = discoveryFlow();
    const result = recordOrder(flow, 'order-1');
    expect(result).toEqual(flow);
  });
});

// ---------------------------------------------------------------------------
// applyToolResult
// ---------------------------------------------------------------------------

describe('applyToolResult', () => {
  describe('searchProducts', () => {
    it('records products on success', () => {
      const flow = discoveryFlow();
      const result = applyToolResult(flow, 'searchProducts', true, {
        products: [product('a')],
      });
      if (result.state === 'PRODUCT_DISCOVERY') {
        expect(result.productDiscovery.toolResults).toHaveLength(1);
      }
    });

    it('does nothing on failure', () => {
      const flow = discoveryFlow();
      const result = applyToolResult(flow, 'searchProducts', false);
      expect(result).toEqual(flow);
    });
  });

  describe('selectProduct', () => {
    it('transitions to PRODUCT_SELECTED', () => {
      const flow = discoveryFlow();
      const result = applyToolResult(flow, 'selectProduct', true);
      expect(result.state).toBe('PRODUCT_SELECTED');
    });

    it('stays on failure', () => {
      const flow = discoveryFlow();
      const result = applyToolResult(flow, 'selectProduct', false);
      expect(result.state).toBe('PRODUCT_DISCOVERY');
    });
  });

  describe('createOrder', () => {
    it('transitions PRODUCT_SELECTED → ORDER_CONFIRMED with order data when created in-conversation', () => {
      const flow = selectedFlow();
      const result = applyToolResult(flow, 'createOrder', true, {
        orderId: 'order-99',
        productId: 'pid-shoes',
        quantity: 2,
      });
      // An order created and confirmed entirely in-conversation is confirmed
      // immediately — there is no separate confirmation step.
      expect(result.state).toBe('ORDER_CONFIRMED');
      if (result.state === 'ORDER_CONFIRMED') {
        expect(result.order.orderId).toBe('order-99');
        expect(result.order.quantity).toBe(2);
      }
    });

    it('holds ORDER_PENDING with partial data when incomplete (no orderId yet)', () => {
      const flow = selectedFlow();
      const result = applyToolResult(flow, 'createOrder', false, {
        productId: 'pid-shoes',
        quantity: 2,
      });
      expect(result.state).toBe('ORDER_PENDING');
      if (result.state === 'ORDER_PENDING') {
        expect(result.order.productId).toBe('pid-shoes');
        expect(result.order.quantity).toBe(2);
      }
    });
  });

  describe('confirmOrder', () => {
    it('transitions ORDER_PENDING → ORDER_CONFIRMED', () => {
      const flow = pendingFlow();
      const result = applyToolResult(flow, 'confirmOrder', true);
      expect(result.state).toBe('ORDER_CONFIRMED');
    });
  });

  describe('cancelOrder', () => {
    it('transitions ORDER_PENDING → ORDER_CANCELLED', () => {
      const flow = pendingFlow();
      const result = applyToolResult(flow, 'cancelOrder', true);
      expect(result.state).toBe('ORDER_CANCELLED');
    });
  });

  describe('modifyOrder', () => {
    it('updates order data without state change', () => {
      const flow = pendingFlow();
      const result = applyToolResult(flow, 'modifyOrder', true, {
        quantity: 5,
      });
      expect(result.state).toBe('ORDER_PENDING');
      if (result.state === 'ORDER_PENDING') {
        expect(result.order.quantity).toBe(5);
      }
    });
  });

  describe('getOrderStatus', () => {
    it('returns flow unchanged (read-only)', () => {
      const flow = pendingFlow();
      const result = applyToolResult(flow, 'getOrderStatus', true);
      expect(result).toEqual(flow);
    });
  });

  describe('suggestProducts', () => {
    it('records products on success', () => {
      const flow = discoveryFlow();
      const result = applyToolResult(flow, 'suggestProducts', true, {
        products: [product('suggested')],
      });
      if (result.state === 'PRODUCT_DISCOVERY') {
        expect(result.productDiscovery.toolResults).toHaveLength(1);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// persistFlowMemory
// ---------------------------------------------------------------------------

describe('persistFlowMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes memory and mapped conversation state', async () => {
    const flow = pendingFlow();
    const memory: ConversationMemory = {
      version: 1,
      globalInformation: { customerName: 'Ahmed' },
      flows: [flow],
      activeFlow: 'f1',
    };

    await persistFlowMemory('conv-1', memory);

    expect(updateMock).toHaveBeenCalledOnce();
    const call = updateMock.mock.calls[0][0];
    expect(call.where.id).toBe('conv-1');
    expect(call.data.state).toBe('WAITING_CONFIRMATION');
    expect(call.data.memory).toEqual(memory);
    expect(call.data.lastMessageAt).toBeInstanceOf(Date);
  });

  it('writes IDLE when no active flow', async () => {
    const memory: ConversationMemory = {
      version: 1,
      globalInformation: {},
      flows: [],
    };

    await persistFlowMemory('conv-2', memory);

    const call = updateMock.mock.calls[0][0];
    expect(call.data.state).toBe('IDLE');
  });

  it('maps PRODUCT_DISCOVERY to PRODUCT_DISCOVERY', async () => {
    const flow = discoveryFlow();
    const memory: ConversationMemory = {
      version: 1,
      globalInformation: {},
      flows: [flow],
      activeFlow: 'f1',
    };

    await persistFlowMemory('conv-3', memory);

    const call = updateMock.mock.calls[0][0];
    expect(call.data.state).toBe('PRODUCT_DISCOVERY');
  });

  it('maps ORDER_CONFIRMED to CONFIRMED', async () => {
    const flow: Flow = {
      flowId: 'f1',
      state: 'ORDER_CONFIRMED',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      productDiscovery: { input: { productName: 'shoes', filters: {} }, toolResults: [] },
      order: { orderId: 'o1' },
      shipping: { method: 'Yalidine' },
    };
    const memory: ConversationMemory = {
      version: 1,
      globalInformation: {},
      flows: [flow],
      activeFlow: 'f1',
    };

    await persistFlowMemory('conv-4', memory);

    const call = updateMock.mock.calls[0][0];
    expect(call.data.state).toBe('CONFIRMED');
  });
});
