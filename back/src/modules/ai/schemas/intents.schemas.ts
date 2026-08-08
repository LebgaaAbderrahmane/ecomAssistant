import { z } from 'zod';

// ─── Intent enum (12 values) ────────────────────────────────────────────
// Multi-intent extraction: a single customer message may produce 1-4 intents.
// See systemPrompts.ts INTENT_EXTRACTION_RULES for segmentation rules.
export const IntentSchema = z.enum([
  // Product
  'PRODUCT_SEARCH',
  'PRODUCT_SELECT',
  'PRODUCT_DETAILS',
  // Order lifecycle
  'ORDER_CREATE',
  'ORDER_CONFIRM',
  'ORDER_MODIFY',
  'ORDER_CANCEL',
  // Shipping / status
  'SHIPPING_CHECK',
  'STATUS_CHECK',
  // Support / fallback
  'ESCALATION',
  'OUT_OF_SCOPE',
  'GOODBYE',
]);
export type Intent = z.infer<typeof IntentSchema>;

// Conversation act — orthogonal to intent, shapes tone not routing.
// Stays at the top level (one per message, not per intent).
export const ConversationActSchema = z.enum([
  'NORMAL',
  'AFFIRM',
  'NEGATE',
  'DIDNT_UNDERSTAND',
  'FRUSTRATED',
  'CHANGE_TOPIC',
]);
export type ConversationAct = z.infer<typeof ConversationActSchema>;

// ─── Tool names ──────────────────────────────────────────────────────────
// Must match the keys registered in tools/registry.ts exactly.
export const ToolNameSchema = z.enum([
  'searchProducts',
  'recallPreviousProducts',
  'chooseProduct',
  'getProductDetails',
  'createOrder',
  'confirmOrder',
  'modifyOrder',
  'cancelOrder',
  'calculateShipping',
  'getOrderStatus',
  'createSupportTicket',
]);
export type ToolName = z.infer<typeof ToolNameSchema>;

// ─── Intent → Tool mapping ──────────────────────────────────────────────
// Deterministic lookup — tool resolution is never guessed by the LLM.
// PRODUCT_SEARCH uses resolveTool() because it routes to two different tools
// based on whether a product entity is present (catalog search) or absent
// (recall from conversation memory).
const INTENT_TOOL_MAP: Partial<Record<Intent, ToolName>> = {
  PRODUCT_SELECT: 'chooseProduct',
  PRODUCT_DETAILS: 'getProductDetails',
  ORDER_CREATE: 'createOrder',
  ORDER_CONFIRM: 'confirmOrder',
  ORDER_MODIFY: 'modifyOrder',
  ORDER_CANCEL: 'cancelOrder',
  SHIPPING_CHECK: 'calculateShipping',
  STATUS_CHECK: 'getOrderStatus',
  ESCALATION: 'createSupportTicket',
};

export function resolveTool(intent: Intent, entities: Record<string, unknown>): ToolName | null {
  if (intent === 'PRODUCT_SEARCH') {
    return entities.product ? 'searchProducts' : 'recallPreviousProducts';
  }
  return INTENT_TOOL_MAP[intent] ?? null;
}

// ─── Tool argument schemas ──────────────────────────────────────────────

export const SearchProductsArgsSchema = z.object({
  product: z.string().min(1),
});

export const RecallPreviousProductsArgsSchema = z.object({
  limit: z.number().int().positive().max(10).optional(),
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

export const CreateOrderArgsSchema = z.object({
  productId: z.string().min(1).optional(),
  product: z.string().min(1).optional(),
  wilaya: z.string().min(1).optional(),
  commune: z.string().min(1),
  quantity: z.number().int().positive().default(1),
}).refine(data => data.productId || data.product, {
  message: 'Either productId or product name is required',
});

export const ConfirmOrderArgsSchema = z.object({
  orderId: z.string().min(1).optional(),
  productName: z.string().min(1).optional(),
});

export const ModifyOrderArgsSchema = z.object({
  wilaya: z.string().min(1).optional(),
  commune: z.string().min(1).optional(),
  quantity: z.number().int().positive().optional(),
}).refine(
  data => data.wilaya !== undefined || data.commune !== undefined || data.quantity !== undefined,
  { message: 'At least one of wilaya, commune, or quantity must be provided' },
);

export const CancelOrderArgsSchema = z.object({
  orderId: z.string().optional(),
  productName: z.string().min(1).optional(),
});

export const CalculateShippingArgsSchema = z.object({
  wilaya: z.string().min(1),
});

export const GetOrderStatusArgsSchema = z.object({
  orderId: z.string().min(1).optional(),
});
