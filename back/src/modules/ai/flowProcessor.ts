import prisma from '../../config/db.config';
import type { Prisma } from '@prisma/client';
import type { ToolName } from './schemas/intents.schemas';
import {
  type Flow,
  type FlowState,
  type FlowProduct,
  type OrderData,
  type ConversationMemory,
} from './memory.types';
import { moduleLogger } from '../../lib/logger';
import {
  toProductSelected,
  toOrderPending,
  toOrderConfirmed,
  toOrderCancelled,
} from './flowHelper';

const log = moduleLogger('flowProcessor');

// ---------------------------------------------------------------------------
// Tool → FlowState mapping
//
// Replaces TOOL_STATE_TRANSITIONS (old ConversationState) with new FlowState
// names. Tools not listed here don't change the flow state (read-only queries,
// escalation, etc.).
// ---------------------------------------------------------------------------

export const TOOL_FLOW_STATE_MAP: Partial<Record<ToolName, FlowState>> = {
  searchProducts: 'PRODUCT_DISCOVERY',
  recallPreviousProducts: 'PRODUCT_DISCOVERY',
  suggestProducts: 'PRODUCT_DISCOVERY',
  chooseProduct: 'PRODUCT_SELECTED',
  getProductDetails: 'PRODUCT_SELECTED',
  createOrder: 'ORDER_PENDING',
  confirmOrder: 'ORDER_CONFIRMED',
  cancelOrder: 'ORDER_CANCELLED',
};

// ---------------------------------------------------------------------------
// FlowState → Prisma ConversationState mapping
//
// Kept in sync with the old TOOL_STATE_TRANSITIONS values so that the
// conversation.state column stays consistent for parts of the system that
// still read it directly (e.g. WhatsApp message routing).
// ---------------------------------------------------------------------------

const FLOW_TO_CONVERSATION_STATE: Record<FlowState, string> = {
  IDLE: 'IDLE',
  PRODUCT_DISCOVERY: 'PRODUCT_DISCOVERY',
  PRODUCT_SELECTED: 'PRODUCT_SELECTED',
  ORDER_PENDING: 'WAITING_CONFIRMATION',
  ORDER_CONFIRMED: 'CONFIRMED',
  ORDER_SHIPPED: 'SHIPPING',
  ORDER_CANCELLED: 'CANCELLED',
  FINISHED: 'FINISHED',
};

// ---------------------------------------------------------------------------
// Pure state transition
// ---------------------------------------------------------------------------

export function transitionState(
  currentState: FlowState,
  toolName: ToolName,
  success: boolean,
): FlowState {
  if (!success) return currentState;
  return TOOL_FLOW_STATE_MAP[toolName] ?? currentState;
}

// ---------------------------------------------------------------------------
// Type guard helpers
// ---------------------------------------------------------------------------

function hasProductDiscovery(
  flow: Flow,
): flow is Flow & { productDiscovery: { input: { productName: string; filters: Record<string, unknown> }; toolResults: FlowProduct[] } } {
  return flow.state !== 'IDLE';
}

function hasOrder(
  flow: Flow,
): flow is Flow & { order: OrderData } {
  return (
    flow.state === 'ORDER_PENDING' ||
    flow.state === 'ORDER_CONFIRMED' ||
    flow.state === 'ORDER_SHIPPED' ||
    flow.state === 'ORDER_CANCELLED' ||
    flow.state === 'FINISHED'
  );
}

// ---------------------------------------------------------------------------
// Pure flow mutations
// ---------------------------------------------------------------------------

export function recordProductResults(
  flow: Flow,
  products: FlowProduct[],
): Flow {
  if (!hasProductDiscovery(flow)) return flow;
  const f = flow as Extract<Flow, { productDiscovery: unknown }>;
  return {
    ...f,
    productDiscovery: {
      ...f.productDiscovery,
      toolResults: [...f.productDiscovery.toolResults, ...products],
    },
    updatedAt: new Date().toISOString(),
  } as Flow;
}

export function clearProductResults(flow: Flow): Flow {
  if (!hasProductDiscovery(flow)) return flow;
  const f = flow as Extract<Flow, { productDiscovery: unknown }>;
  return {
    ...f,
    productDiscovery: {
      ...f.productDiscovery,
      toolResults: [],
    },
    updatedAt: new Date().toISOString(),
  } as Flow;
}

export function recordOrder(
  flow: Flow,
  orderId: string,
  productId?: string,
  quantity?: number,
): Flow {
  if (!hasOrder(flow)) return flow;
  const f = flow as Extract<Flow, { order: unknown }>;
  return {
    ...f,
    order: {
      ...f.order,
      orderId,
      ...(productId !== undefined && { productId }),
      ...(quantity !== undefined && { quantity }),
    },
    updatedAt: new Date().toISOString(),
  } as Flow;
}

// ---------------------------------------------------------------------------
// applyToolResult — orchestrates state transition + data recording
//
// Pure: takes a Flow + tool outcome, returns a new Flow. Does NOT persist.
// The caller (orchestrator / pipeline) is responsible for persisting the
// resulting memory via persistFlowMemory.
// ---------------------------------------------------------------------------

export function applyToolResult(
  flow: Flow,
  toolName: ToolName,
  success: boolean,
  result?: Record<string, unknown>,
): Flow {
  if (!success) return flow;

  const newState = transitionState(flow.state, toolName, success);
  if (newState === flow.state) {
    // No state change — still may need to record data (e.g. modifyOrder)
    return applyDataRecording(flow, toolName, result);
  }

  log.debug(
    { flowId: flow.flowId, tool: toolName, from: flow.state, to: newState },
    'applyToolResult: state transition',
  );
  const transitioned = applyStateTransition(flow, toolName, newState, result);
  return applyDataRecording(transitioned, toolName, result);
}

function applyStateTransition(
  flow: Flow,
  toolName: ToolName,
  newState: FlowState,
  _result?: Record<string, unknown>,
): Flow {
  switch (newState) {
    case 'PRODUCT_SELECTED': {
      if (flow.state !== 'PRODUCT_DISCOVERY') return flow;
      const selectedId = _result?.productId as string | undefined;
      return toProductSelected(flow, selectedId);
    }
    case 'ORDER_PENDING': {
      if (flow.state !== 'PRODUCT_SELECTED') return flow;
      const orderData: OrderData = {
        orderId: _result?.orderId as string | undefined,
        productId: _result?.productId as string | undefined,
        quantity: _result?.quantity as number | undefined,
      };
      return toOrderPending(flow, orderData);
    }
    case 'ORDER_CONFIRMED': {
      if (flow.state !== 'ORDER_PENDING') return flow;
      return toOrderConfirmed(flow, {});
    }
    case 'ORDER_CANCELLED': {
      if (flow.state !== 'ORDER_PENDING' && flow.state !== 'ORDER_CONFIRMED') return flow;
      return toOrderCancelled(flow);
    }
    default:
      return flow;
  }
}

function applyDataRecording(
  flow: Flow,
  toolName: ToolName,
  result?: Record<string, unknown>,
): Flow {
  switch (toolName) {
    case 'searchProducts':
    case 'recallPreviousProducts':
    case 'suggestProducts': {
      const products = result?.products as FlowProduct[] | undefined;
      if (products?.length) {
        return recordProductResults(flow, products);
      }
      return flow;
    }
    case 'modifyOrder': {
      if (!hasOrder(flow)) return flow;
      return recordOrder(
        flow,
        flow.order.orderId ?? '',
        result?.productId as string | undefined,
        result?.quantity as number | undefined,
      );
    }
    case 'createOrder': {
      if (!hasOrder(flow)) return flow;
      return recordOrder(
        flow,
        (result?.orderId as string) ?? flow.order.orderId ?? '',
        result?.productId as string | undefined,
        result?.quantity as number | undefined,
      );
    }
    default:
      return flow;
  }
}

// ---------------------------------------------------------------------------
// persistFlowMemory — async persistence to Prisma
//
// Writes both conversation.memory (the ConversationMemory JSON) and
// conversation.state (the old ConversationState enum) in a single update
// so they stay in sync during the migration period.
// ---------------------------------------------------------------------------

export async function persistFlowMemory(
  conversationId: string,
  memory: ConversationMemory,
): Promise<void> {
  const activeFlow = memory.flows.find((f) => f.flowId === memory.activeFlow);
  const conversationState = activeFlow
    ? FLOW_TO_CONVERSATION_STATE[activeFlow.state]
    : 'IDLE';

  log.info(
    { conversationId, flowState: activeFlow?.state, conversationState, flowCount: memory.flows.length, activeFlowId: memory.activeFlow?.slice(0, 8) ?? null },
    'persistFlowMemory: writing',
  );

  try {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        memory: memory as unknown as Prisma.InputJsonValue,
        state: conversationState as never,
        lastMessageAt: new Date(),
      },
    });
  } catch (err) {
    log.error({ conversationId, err }, 'persistFlowMemory: failed to write');
    throw err;
  }
}
