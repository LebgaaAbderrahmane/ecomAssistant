import { z } from 'zod';
import { IntentFieldSchema, ConversationActSchema, ProductDetailFieldSchema } from './intents.schemas';

// Entities are intentionally loose at this layer — each tool tightens its own
// argument shape via its own Zod schema. This just guards against the
// LLM returning nested objects/arrays we don't expect.
export const EntitiesSchema = z
  .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .default({});

// ─── Single intent item ─────────────────────────────────────────────────
export const IntentItemSchema = z.object({
  intent: IntentFieldSchema,
  entities: EntitiesSchema,
  confidence: z.number().min(0).max(1),
  order: z.number().int().min(1).max(4),
  // status defaults to 'resolved' when Gemini omits it
  status: z.enum(['resolved', 'unresolved']).default('resolved'),
  // candidates + unresolvedReason default to null when Gemini omits them
  candidates: z.array(z.string()).nullable().default(null),
  unresolvedReason: z.string().nullable().default(null),
  // For PRODUCT_DETAILS: the specific fields the customer asked about
  // (price, images, description, variants, stock, category). Empty when the
  // request names no specific fields. getProductDetails returns only these.
  details: z.array(ProductDetailFieldSchema).max(6).default([]),
});

// ─── LLM #1 response (multi-intent) ────────────────────────────────────
export const LLMResponseSchema = z.object({
  intents: z.array(IntentItemSchema).min(1).max(4),
  conversationAct: ConversationActSchema,
  refersToPreviousFlow: z.boolean().default(false),
});

// ─── LLM #2 response (multi-message) ────────────────────────────────────
export const ReplyResponseSchema = z.object({
  messages: z.array(z.string().min(1)).min(1).max(3),
});

export type IntentItem = z.infer<typeof IntentItemSchema>;
export type ReplyResponse = z.infer<typeof ReplyResponseSchema>;
export type LLMResponse = z.infer<typeof LLMResponseSchema>;
