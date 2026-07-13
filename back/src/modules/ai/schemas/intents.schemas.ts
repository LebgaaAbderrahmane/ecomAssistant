import { z } from 'zod';

// MVP intent set — §6.1 of the implementation plan.
// Additive by design: Phase 2 intents get appended here, nothing else changes.
export const IntentSchema = z.enum([
  // Product
  'SEARCH_PRODUCT',
  'ASK_PRODUCT_DETAILS',
  'RECALL_PREVIOUS_PRODUCT',
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
  'chooseProduct',
  'createOrder',
  'confirmOrder',
  'cancelOrder',
  'getOrderStatus',
  'calculateShipping',
  'updateAddress',
  'createSupportTicket',
  'recallPreviousProducts'
]);
export type ToolName = z.infer<typeof ToolNameSchema>;


export const SearchProductsArgsSchema = z.object({
  product: z.string().min(1),
});

export const ConfirmOrderArgsSchema = z.object({
  orderId: z.string().min(1).optional(),
  productName: z.string().min(1).optional(),
});

export const GetOrderStatusArgsSchema = z.object({
  orderId: z.string().min(1).optional(), // falls back to conversation.currentOrderId if absent
});

export const CalculateShippingArgsSchema = z.object({
  wilaya: z.string().min(1),
});

export const CancelOrderArgsSchema = z.object({
  orderId: z.string().optional(),
  productName: z.string().min(1).optional(),
});

export const RecallPreviousProductsArgsSchema = z.object({
  limit: z.number().int().positive().max(10).optional(), // "the last 3 products" etc.
});

export const CreateOrderArgsSchema = z.object({
  productId: z.string().min(1).optional(),
  product: z.string().min(1).optional(),
  wilaya: z.string().min(1).optional(),
  address: z.string().min(1),
  commune: z.string().optional(),
  quantity: z.number().int().positive().default(1),
}).refine(data => data.productId || data.product, {
  message: 'Either productId or product name is required',
});

export const UpdateAddressArgsSchema = z.object({
  wilaya: z.string().min(1).optional(),
  commune: z.string().optional(),
  address: z.string().min(1).optional(),
}).refine(data => data.wilaya !== undefined || data.commune !== undefined || data.address !== undefined, {
  message: 'At least one of wilaya, commune, or address must be provided',
});

export const ChooseProductArgsSchema = z.object({
  productName: z.string().min(1).optional(),
  productIndex: z.number().int().min(0).optional(),
}).refine(data => data.productName || data.productIndex !== undefined, {
  message: 'Either productName or productIndex is required',
});

export const GetProductDetailsArgsSchema = z.object({
  productName: z.string().min(1).optional(),
});