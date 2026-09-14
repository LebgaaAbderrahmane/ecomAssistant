import type { ReadToolName, ToolName } from './schemas/intents.schemas';

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
// Tools that start a fresh product workflow (search / suggest) move the
// conversation back into discovery — this is what invalidates a stale
// WAITING_CONFIRMATION when the customer pivots to a new product before
// confirming their order. Tools that keep the conversation where it is
// (status checks, shipping quotes, escalation) intentionally map to no state
// change.
//
// Ownership: READ-tool transitions (READ_TOOL_TRANSITIONS) are applied by the
// TRANSPORT (gRPC ToolService) after a successful run — tool handlers are pure
// functions of their explicit params and never write conversation state.
// WRITE-tool transitions (createOrder / confirmOrder / cancelOrder) are written
// by the handlers themselves, alongside the business mutation they belong to.
export const TOOL_STATE_TRANSITIONS: Partial<Record<ToolName, ConversationState>> = {
  searchProducts: 'PRODUCT_DISCOVERY',
  suggestProducts: 'PRODUCT_DISCOVERY',
  selectProduct: 'PRODUCT_SELECTED',
  getProductDetails: 'PRODUCT_SELECTED',
  createOrder: 'WAITING_CONFIRMATION',
  confirmOrder: 'CONFIRMED',
  cancelOrder: 'CANCELLED',
};

// READ-tool transitions the transport applies after a successful run; the
// handlers never touch the conversation row. selectProduct / getProductDetails
// additionally set currentProductId from the tool result's productId.
export const READ_TOOL_TRANSITIONS: Partial<Record<ReadToolName, ConversationState>> = {
  searchProducts: TOOL_STATE_TRANSITIONS.searchProducts,
  suggestProducts: TOOL_STATE_TRANSITIONS.suggestProducts,
  selectProduct: TOOL_STATE_TRANSITIONS.selectProduct,
  getProductDetails: TOOL_STATE_TRANSITIONS.getProductDetails,
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
