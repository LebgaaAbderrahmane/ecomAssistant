import type { ToolName } from './schemas/intents.schemas';

// Canonical conversation states. Must match the ConversationState enum in
// prisma/schema.prisma.
export type ConversationState =
  | 'IDLE'
  | 'GREETING'
  | 'PRODUCT_DISCOVERY'
  | 'PRODUCT_SELECTED'
  | 'WAITING_CONFIRMATION'
  | 'CONFIRMED'
  | 'SHIPPING'
  | 'FINISHED'
  | 'CANCELLED';

// Tool -> conversation state applied on a successful run.
//
// Tools that start a fresh product workflow (search / recall) move the
// conversation back into discovery — this is what invalidates a stale
// WAITING_CONFIRMATION when the customer pivots to a new product before
// confirming their order. Tools that keep the conversation where it is
// (status checks, shipping quotes, escalation) intentionally map to no state
// change.
export const TOOL_STATE_TRANSITIONS: Partial<Record<ToolName, ConversationState>> = {
  searchProducts: 'PRODUCT_DISCOVERY',
  recallPreviousProducts: 'PRODUCT_DISCOVERY',
  suggestProducts: 'PRODUCT_DISCOVERY',
  chooseProduct: 'PRODUCT_SELECTED',
  getProductDetails: 'PRODUCT_SELECTED',
  createOrder: 'WAITING_CONFIRMATION',
  confirmOrder: 'CONFIRMED',
  cancelOrder: 'CANCELLED',
};

/**
 * Pure state-transition helper. Returns the conversation state a tool success
 * should land on. Failures never advance the conversation.
 */
export function nextConversationState(
  currentState: string,
  toolName: ToolName,
  success: boolean,
): string {
  if (!success) return currentState;
  return TOOL_STATE_TRANSITIONS[toolName] ?? currentState;
}
