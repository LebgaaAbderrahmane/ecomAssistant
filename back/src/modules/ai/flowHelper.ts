import {
  CURRENT_MEMORY_VERSION,
  Flow,
  FlowFilter,
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

// ---------------------------------------------------------------------------
// Transitions
//
// With Flow as a discriminated union, moving to a new state means building
// a new object that satisfies that state's required fields — the compiler
// rejects a transition that's missing data the target state needs.
// ---------------------------------------------------------------------------

export function toProductSelected(
  flow: Extract<Flow, { state: 'PRODUCT_DISCOVERY' }>,
): Extract<Flow, { state: 'PRODUCT_SELECTED' }> {
  return { ...flow, state: 'PRODUCT_SELECTED', updatedAt: new Date().toISOString() };
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