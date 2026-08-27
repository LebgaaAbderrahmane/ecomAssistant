import {
  CURRENT_MEMORY_VERSION,
  Flow,
  FlowFilter,
  FlowProduct,
  ConversationMemory,
  OrderData,
  ShippingData,
} from './memory.types';

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export function createFlow(input: {
  productName: string;
  filters: FlowFilter;
}): Extract<Flow, { state: 'PRODUCT_DISCOVERY' }> {
  const now = new Date().toISOString();
  return {
    flowId: crypto.randomUUID(),
    state: 'PRODUCT_DISCOVERY',
    createdAt: now,
    updatedAt: now,
    productDiscovery: {
      input: {
        productName: input.productName,
        filters: input.filters,
      },
      toolResults: [],
    },
  };
}

/**
 * Append an ORDER_PENDING flow to an existing ConversationMemory from external
 * order data (e.g. a Shopify webhook). Preserves all existing flows, global
 * information, and other memory fields. Sets activeFlow to the new flow.
 */
export function addOrderFlowToMemory(
  existingMemory: ConversationMemory,
  input: {
    orderId: string;
    productName: string;
    totalAmount: number;
    quantity?: number;
    wilaya?: string;
    commune?: string;
    customerName?: string;
    productId?: string;
  },
): ConversationMemory {
  const now = new Date().toISOString();
  const flow: Flow = {
    flowId: crypto.randomUUID(),
    state: 'ORDER_PENDING',
    createdAt: now,
    updatedAt: now,
    productDiscovery: {
      input: { productName: input.productName, filters: {} },
      toolResults: [{
        productId: input.productId ?? input.orderId,
        productName: input.productName,
        price: input.totalAmount,
        variants: [],
      } as FlowProduct],
    },
    order: {
      orderId: input.orderId,
      productId: input.productId ?? input.orderId,
      quantity: input.quantity ?? 1,
    },
  };

  return {
    ...existingMemory,
    globalInformation: {
      ...existingMemory.globalInformation,
      ...(input.customerName && { customerName: input.customerName }),
      ...(input.wilaya && { wilaya: input.wilaya }),
      ...(input.commune && { commune: input.commune }),
    },
    flows: [...existingMemory.flows, flow],
    activeFlow: flow.flowId,
  };
}

/**
 * Build a fresh ConversationMemory with an ORDER_PENDING flow from external
 * order data. Use when no existing conversation memory exists.
 */
export function createMemoryFromOrder(input: {
  orderId: string;
  productName: string;
  totalAmount: number;
  quantity?: number;
  wilaya?: string;
  commune?: string;
  customerName?: string;
  productId?: string;
}): ConversationMemory {
  const empty: ConversationMemory = {
    version: CURRENT_MEMORY_VERSION,
    globalInformation: {},
    flows: [],
  };
  return addOrderFlowToMemory(empty, input);
}

// ---------------------------------------------------------------------------
// Transitions
//
// With Flow as a discriminated union, moving to a new state means building
// a new object that satisfies that state's required fields — the compiler
// rejects a transition that's missing data the target state needs.
// ---------------------------------------------------------------------------

export function toProductSelected(
  flow: Extract<Flow, { state: 'PRODUCT_DISCOVERY' }>,
  selectedProductId?: string,
): Extract<Flow, { state: 'PRODUCT_SELECTED' }> {
  return { ...flow, state: 'PRODUCT_SELECTED', currentProductId: selectedProductId, updatedAt: new Date().toISOString() };
}

export function toOrderPending(
  flow: Extract<Flow, { state: 'PRODUCT_SELECTED' }>,
  order: OrderData,
): Extract<Flow, { state: 'ORDER_PENDING' }> {
  return { ...flow, state: 'ORDER_PENDING', order, updatedAt: new Date().toISOString() };
}

export function toOrderConfirmed(
  flow: Extract<Flow, { state: 'ORDER_PENDING' }>,
  shipping: ShippingData,
): Extract<Flow, { state: 'ORDER_CONFIRMED' }> {
  return { ...flow, state: 'ORDER_CONFIRMED', shipping, updatedAt: new Date().toISOString() };
}

export function toOrderShipped(
  flow: Extract<Flow, { state: 'ORDER_CONFIRMED' }>,
): Extract<Flow, { state: 'ORDER_SHIPPED' }> {
  return { ...flow, state: 'ORDER_SHIPPED', updatedAt: new Date().toISOString() };
}

export function toOrderCancelled(
  flow: Extract<Flow, { state: 'ORDER_PENDING' | 'ORDER_CONFIRMED' }>,
): Extract<Flow, { state: 'ORDER_CANCELLED' }> {
  return { ...flow, state: 'ORDER_CANCELLED', updatedAt: new Date().toISOString() };
}

export function toFinished(
  flow: Extract<Flow, { state: 'ORDER_SHIPPED' }>,
): Extract<Flow, { state: 'FINISHED' }> {
  return { ...flow, state: 'FINISHED', updatedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export function getActiveFlow(memory: ConversationMemory): Flow | undefined {
  if (!memory.activeFlow) return undefined;
  return memory.flows.find((f) => f.flowId === memory.activeFlow);
}

export function findFlowById(
  memory: ConversationMemory,
  flowId: string,
): Flow | undefined {
  return memory.flows.find((f) => f.flowId === flowId);
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

export function migrateMemory(raw: unknown): ConversationMemory {
  if (!raw || typeof raw !== 'object') {
    return { version: CURRENT_MEMORY_VERSION, globalInformation: {}, flows: [] };
  }
  const obj = raw as Record<string, unknown>;

  // Already current shape.
  if (obj.version === CURRENT_MEMORY_VERSION && 'globalInformation' in obj && 'flows' in obj) {
    return raw as ConversationMemory;
  }

  // v0 (pre-Flow architecture) -> v1
  if (!('version' in obj)) {
    const entities = (obj.entities ?? {}) as Record<string, unknown>;
    return {
      version: CURRENT_MEMORY_VERSION,
      globalInformation: {
        customerName: obj.customerName as string | undefined,
        wilaya: entities.wilaya as string | undefined,
        commune: entities.commune as string | undefined,
      },
      flows: [],
      activeFlow: undefined,
      recentIntents: Array.isArray(obj.recentIntents) ? (obj.recentIntents as string[]) : undefined,
    };
  }

  // Add future version bumps here, e.g.:
  // if (obj.version === 1) { return migrateV1ToV2(obj as ConversationMemoryV1); }

  throw new Error(`migrateMemory: unrecognized memory shape (version: ${String(obj.version)})`);
}

// ---------------------------------------------------------------------------
// Deprecated re-exports kept out of here on purpose — ProductResult and
// IntentSummary have no behavior attached to them, so they only live in
// flow.types.ts.
// ---------------------------------------------------------------------------