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

// Internal/legacy tools: registered and executable by the backend (fallback
// paths) but NOT part of the agent-facing contract catalog (contracts TOOL_NAMES
// / generated tools.json). Currently none — the migration to explicit,
// context-free tools is complete. The contract test enforces:
// TOOL_NAMES == (registry − legacy) and no overlap.
export const LEGACY_ONLY_TOOL_NAMES = [] as const;
export type LegacyOnlyToolName = (typeof LEGACY_ONLY_TOOL_NAMES)[number];

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
// PRODUCT_SEARCH uses resolveTool() to stay consistent with the mapping below.
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
    return 'searchProducts';
  }
  return INTENT_TOOL_MAP[intent] ?? null;
}

// ─── Tool argument schemas ──────────────────────────────────────────────
// Each tool consumes ONLY explicit params. Identity (merchantId/customerId/
// conversationId) and previously-stateful context (current order/product,
// customer address, conversation memory/state) are MATERIALIZED into explicit
// native keys by the transport (the legacy pipeline today, the gRPC ToolService
// later), not read by the tool from a context object. The tool never looks at
// memory/state or the customer record itself.
//
// Injected identity keys — required wherever a tool needs the scope:
//   merchantId      — every tool (merchant-scoped reads/writes).
//   customerId      — order/customer-scoped tools.
//   conversationId  — tools that read or write the conversation row
//                     (all write tools; navigation read tools).
// Injected state keys — optional, transport-supplied; the transport (legacy
// pipeline today, gRPC ToolService later) MATERIALIZES previously-implicit
// context into explicit native params:
//   orderId   — from conversation.currentOrderId (confirmOrder / cancelOrder /
//               modifyOrder / getOrderStatus when the caller omits it).
//   productId — from conversation.currentProductId (getProductDetails).
//               Product tools never resolve "bare" references from memory
//               anymore — searchProducts is a pure catalog query, selectProduct
//               takes the explicit id/name.
//   excludedProductIds — abandoned/rejected product ids computed from
//               conversation memory by the TRANSPORT and passed to
//               suggestProducts as a JSON-encoded string; the tool itself
//               never reads memory.

const InjectedMerchantId = { merchantId: z.string().min(1) };
const InjectedCustomerId = { customerId: z.string().min(1) };
const InjectedConversationId = { conversationId: z.string().min(1) };
const InjectedProductId = { productId: z.string().optional() };
const InjectedExcludedProductIds = { excludedProductIds: z.string().optional() };

export const SearchProductsArgsSchema = z.object({
  product: z.string().min(1),
  ...InjectedMerchantId,
  ...InjectedConversationId,
});

export const SelectProductArgsSchema = z.object({
  productId: z.string().min(1).optional(),
  productName: z.string().min(1).optional(),
  ...InjectedMerchantId,
  ...InjectedConversationId,
}).refine(data => data.productId !== undefined || data.productName !== undefined, {
  message: 'Either productId or productName is required',
});

export const GetProductDetailsArgsSchema = z.object({
  productName: z.string().min(1).optional(),
  ...InjectedMerchantId,
  ...InjectedConversationId,
  ...InjectedProductId,
}).refine(data => data.productId !== undefined || data.productName !== undefined, {
  message: 'Either productId or productName is required',
});

export const SuggestProductsArgsSchema = z.object({
  category: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  size: z.string().min(1).optional(),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  preferences: z.string().min(1).optional(),
  ...InjectedExcludedProductIds,
  ...InjectedMerchantId,
  ...InjectedConversationId,
});

export const CreateOrderArgsSchema = z.object({
  productId: z.string().min(1),
  wilaya: z.string().min(1),
  commune: z.string().min(1),
  quantity: z.number().int().positive(),
  ...InjectedMerchantId,
  ...InjectedCustomerId,
  ...InjectedConversationId,
});

export const ConfirmOrderArgsSchema = z.object({
  orderId: z.string().min(1),
  ...InjectedMerchantId,
  ...InjectedCustomerId,
  ...InjectedConversationId,
});

export const ModifyOrderArgsSchema = z.object({
  orderId: z.string().min(1),
  wilaya: z.string().min(1).optional(),
  commune: z.string().min(1).optional(),
  quantity: z.number().int().positive().optional(),
  ...InjectedMerchantId,
  ...InjectedCustomerId,
}).refine(
  data => data.wilaya !== undefined || data.commune !== undefined || data.quantity !== undefined,
  { message: 'At least one of wilaya, commune, or quantity must be provided' },
);

export const CancelOrderArgsSchema = z.object({
  orderId: z.string().min(1),
  ...InjectedMerchantId,
  ...InjectedCustomerId,
  ...InjectedConversationId,
});

export const CalculateShippingArgsSchema = z.object({
  wilaya: z.string().min(1),
  ...InjectedMerchantId,
});

export const GetOrderStatusArgsSchema = z.object({
  orderId: z.string().min(1),
  ...InjectedMerchantId,
  ...InjectedCustomerId,
});

export const EscalateConversationArgsSchema = z.object({
  reason: z.string().min(1),
  ...InjectedMerchantId,
  ...InjectedCustomerId,
  ...InjectedConversationId,
});

// Central validation map. executeTool validates `entities` against the tool's
// schema — the single authoritative check — before dispatch. Handlers receive
// ONLY explicit params: no context, no memory/state reads. The map base for the
// generated tools.json contract (see back/scripts/export-contract.ts).
export const toolSchemas: Record<ToolName, z.ZodType<unknown>> = {
  searchProducts: SearchProductsArgsSchema,
  selectProduct: SelectProductArgsSchema,
  getProductDetails: GetProductDetailsArgsSchema,
  suggestProducts: SuggestProductsArgsSchema,
  calculateShipping: CalculateShippingArgsSchema,
  getOrderStatus: GetOrderStatusArgsSchema,
  createOrder: CreateOrderArgsSchema,
  confirmOrder: ConfirmOrderArgsSchema,
  modifyOrder: ModifyOrderArgsSchema,
  cancelOrder: CancelOrderArgsSchema,
  escalateConversation: EscalateConversationArgsSchema,
};
