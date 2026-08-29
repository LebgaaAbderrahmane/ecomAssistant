import { z } from 'zod';

// ─── Intent enum (12 values) ────────────────────────────────────────────
// Multi-intent extraction: a single customer message may produce 1-4 intents.
// See systemPrompts.ts INTENT_EXTRACTION_RULES for segmentation rules.
export const IntentSchema = z.enum([
  // Product
  'PRODUCT_SEARCH',
  'PRODUCT_SELECT',
  'PRODUCT_DETAILS',
  'PRODUCT_SUGGEST',
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

// ─── Suggested intent field ─────────────────────────────────────────────
// When the LLM can't map a request to a covered intent, it may propose a new
// one. It is flagged with `suggested: true` and carries a canonical name +
// short description. These are persisted (with a count) in SuggestedIntent.
export const SuggestedIntentFieldSchema = z.object({
  suggested: z.literal(true),
  name: z.string().min(1).max(60),
  description: z.string().min(1).max(200),
});
export type SuggestedIntentField = z.infer<typeof SuggestedIntentFieldSchema>;

// A single intent field is either a covered intent (enum) or a suggested one.
export const IntentFieldSchema = z.union([IntentSchema, SuggestedIntentFieldSchema]);
export type IntentField = z.infer<typeof IntentFieldSchema>;

export function isSuggestedIntent(
  intent: IntentField
): intent is SuggestedIntentField {
  return typeof intent !== 'string' && intent.suggested === true;
}

export function intentToString(intent: IntentField): string {
  return isSuggestedIntent(intent) ? `SUGGESTED:${intent.name}` : intent;
}

// ─── Tool names ──────────────────────────────────────────────────────────
// Must match the keys registered in tools/registry.ts exactly. Each tool has
// an explicit execution policy:
//
//   READ  — no business side-effects (orders, customer, takeover are untouched;
//           conversation navigation state/memory is fine). Suppressed while a
//           human owns the conversation.
//   WRITE — mutates business data (order lifecycle, customer profile, takeover
//           flag). Executed even while a human owns the conversation.
//
// ToolNameSchema is the union of both; a tool must appear in exactly one of
// the two enums (enforced by the registry typing + a test).
export const ReadToolNameSchema = z.enum([
  'searchProducts',
  'recallPreviousProducts',
  'selectProduct',
  'getProductDetails',
  'suggestProducts',
  'calculateShipping',
  'getOrderStatus',
]);
export type ReadToolName = z.infer<typeof ReadToolNameSchema>;

export const WriteToolNameSchema = z.enum([
  'createOrder',
  'confirmOrder',
  'modifyOrder',
  'cancelOrder',
  'escalateConversation',
]);
export type WriteToolName = z.infer<typeof WriteToolNameSchema>;

export const ToolNameSchema = z.union([ReadToolNameSchema, WriteToolNameSchema]);
export type ToolName = z.infer<typeof ToolNameSchema>;

/** Type guard: whether a tool is classified as READ (no business side-effects). */
export function isReadTool(name: ToolName): name is ReadToolName {
  return ReadToolNameSchema.safeParse(name).success;
}

/** Type guard: whether a tool is classified as WRITE (mutates business data). */
export function isWriteTool(name: ToolName): name is WriteToolName {
  return WriteToolNameSchema.safeParse(name).success;
}

// ─── Intent → Tool mapping ──────────────────────────────────────────────
// Deterministic lookup — tool resolution is never guessed by the LLM.
// PRODUCT_SEARCH uses resolveTool() because it routes to two different tools
// based on whether a product entity is present (catalog search) or absent
// (recall from conversation memory).
const INTENT_TOOL_MAP: Partial<Record<Intent, ToolName>> = {
  PRODUCT_SELECT: 'selectProduct',
  PRODUCT_DETAILS: 'getProductDetails',
  PRODUCT_SUGGEST: 'suggestProducts',
  ORDER_CREATE: 'createOrder',
  ORDER_CONFIRM: 'confirmOrder',
  ORDER_MODIFY: 'modifyOrder',
  ORDER_CANCEL: 'cancelOrder',
  SHIPPING_CHECK: 'calculateShipping',
  STATUS_CHECK: 'getOrderStatus',
  ESCALATION: 'escalateConversation',
};

export function resolveTool(intent: IntentField, entities: Record<string, unknown>): ToolName | null {
  if (isSuggestedIntent(intent)) {
    return null;
  }
  if (intent === 'PRODUCT_SEARCH') {
    return entities.product || entities.productName
      ? 'searchProducts'
      : 'recallPreviousProducts';
  }
  return INTENT_TOOL_MAP[intent] ?? null;
}

// ─── Tool argument schemas ──────────────────────────────────────────────

export const SearchProductsArgsSchema = z
  .object({
    product: z.string().min(1).optional(),
    productName: z.string().min(1).optional(),
  })
  .refine((d) => d.product || d.productName, {
    message: 'No product name provided to search for',
    path: ['product'],
  });

export const RecallPreviousProductsArgsSchema = z.object({
  limit: z.number().int().positive().max(10).optional(),
});

export const SelectProductArgsSchema = z.object({
  productName: z.string().min(1).optional(),
  productIndex: z.number().int().min(0).optional(),
}).refine(data => data.productName || data.productIndex !== undefined, {
  message: 'Either productName or productIndex is required',
});

export const GetProductDetailsArgsSchema = z.object({
  productName: z.string().min(1).optional(),
});

export const SuggestProductsArgsSchema = z.object({
  category: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  size: z.string().min(1).optional(),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  preferences: z.string().min(1).optional(),
});

export const CreateOrderArgsSchema = z.object({
  productId: z.string().min(1).optional(),
  product: z.string().min(1).optional(),
  wilaya: z.string().min(1).optional(),
  commune: z.string().min(1).optional(),
  quantity: z.preprocess(
    v => (typeof v === 'number' ? v : v === null || v === undefined || v === '' ? undefined : Number(v)),
    z.number().int().positive().optional(),
  ),
  communeSuggestion: z.string().min(1).optional(),
});

export const ConfirmOrderArgsSchema = z.object({
  orderId: z.string().min(1).optional(),
  productName: z.string().min(1).optional(),
});

export const ModifyOrderArgsSchema = z.object({
  wilaya: z.string().min(1).optional(),
  commune: z.string().min(1).optional(),
  quantity: z.preprocess(
    v => (typeof v === 'number' ? v : v === null || v === undefined || v === '' ? undefined : Number(v)),
    z.number().int().positive().optional(),
  ),
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
