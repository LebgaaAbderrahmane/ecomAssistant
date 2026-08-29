import type { Flow } from '../memory.types';
import { moduleLogger } from "../../../lib/logger"

// ---------------------------------------------------------------------------
// Flow extraction helpers
//
// Tools read conversation context (order ID, product ID, last search results)
// exclusively from the active flow rather than from flat conversation columns.
// These helpers are null-safe: when the flow is null or in a state that does
// not carry the requested data they return undefined, letting the tool fall
// back to explicit entity args or return a "not in context" error.
// ---------------------------------------------------------------------------

const logger = moduleLogger('flow extraction: ')

export function getFlowOrderId(flow: Flow | null): string | undefined {
  if (!flow) return undefined;
  if ('order' in flow && flow.order?.orderId) return flow.order.orderId;
  return undefined;
}

/** Returns the current product ID for the flow. This is the primary way tools
 *  should resolve the product in focus. Set by selectProduct, auto-selected
 *  from single search results, or determined from the customer's message. */
export function getFlowCurrentProductId(flow: Flow | null): string | undefined {
  if (!flow) return undefined;
  if (flow.state === 'IDLE') return undefined;
  return flow.currentProductId;
}

/** @deprecated Use getFlowCurrentProductId. Kept for backward compat during migration. */
export function getFlowSelectedProductId(flow: Flow | null): string | undefined {
  return getFlowCurrentProductId(flow);
}

export function getFlowProductResults(flow: Flow | null): Array<{ id: string; name: string }> | undefined {
  if (!flow || flow.state === 'IDLE') return undefined;
  if ('productDiscovery' in flow) {
    return flow.productDiscovery.toolResults.map(p => ({ id: p.productId, name: p.productName }));
  }
  return undefined;
}
