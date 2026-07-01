import { z } from 'zod';

// MVP intent set — §6.1 of the implementation plan.
// Additive by design: Phase 2 intents get appended here, nothing else changes.
export const IntentSchema = z.enum([
  // Product
  'SEARCH_PRODUCT',
  'ASK_PRODUCT_DETAILS',
  'CHECK_PRICE',
  'CHECK_STOCK',
  // Order
  'CREATE_ORDER',
  'CONFIRM_ORDER',
  'MODIFY_ORDER',
  'CANCEL_ORDER',
  'CHECK_ORDER_STATUS',
  // Shipping
  'CHECK_DELIVERY_COST',
  'CHECK_DELIVERY_TIME',
  'CHANGE_ADDRESS',
  // Support
  'REPORT_PROBLEM',
  'CONTACT_SUPPORT',
  // Fallback
  'OUT_OF_SCOPE',
  'UNKNOWN',
]);
export type Intent = z.infer<typeof IntentSchema>;

// Conversation act — orthogonal to intent, shapes tone not routing (§6.2)
export const ConversationActSchema = z.enum([
  'NORMAL',
  'AFFIRM',
  'NEGATE',
  'DIDNT_UNDERSTAND',
  'FRUSTRATED',
  'GOODBYE',
  'CHANGE_TOPIC',
]);
export type ConversationAct = z.infer<typeof ConversationActSchema>;

// Must match the keys registered in tools/registry.ts exactly.
export const ToolNameSchema = z.enum([
  'searchProducts',
  'getProductDetails',
  'createOrder',
  'confirmOrder',
  'cancelOrder',
  'getOrderStatus',
  'calculateShipping',
  'updateAddress',
  'createSupportTicket',
]);
export type ToolName = z.infer<typeof ToolNameSchema>;