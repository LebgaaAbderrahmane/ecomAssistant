import { IntentSchema, ConversationActSchema } from './intents.schemas';

// Gemini's responseSchema uses a JSON-Schema-like format, not Zod directly —
// this constrains what the model generates. ai.schemas.ts (Zod) validates
// the result afterward. Two different schema systems for two different jobs:
// this one shapes generation, that one verifies it. Keep them in sync by hand
// when the intent/tool enums change.

// ─── Intent item schema (one per extracted intent) ──────────────────────
// The intent field is an anyOf: a covered intent (string enum) OR a suggested
// intent (object flagged `suggested: true`). Mirrors IntentFieldSchema in
// intents.schemas.ts; keep both in sync by hand.
const INTENT_ITEM_SCHEMA = {
  type: 'object' as const,
  properties: {
    intent: {
      anyOf: [
        { type: 'string' as const, enum: [...IntentSchema.options] },
        {
          type: 'object' as const,
          properties: {
            suggested: { type: 'boolean' as const },
            name: { type: 'string' as const },
            description: { type: 'string' as const },
          },
          required: ['suggested', 'name', 'description'] as const,
        },
      ],
    },
    entities: {
      type: 'object' as const,
      properties: {
        product: { type: 'string' as const },
        productName: { type: 'string' as const },
        orderId: { type: 'string' as const },
        wilaya: { type: 'string' as const },
        commune: { type: 'string' as const },
        quantity: { type: 'string' as const },
        productIndex: { type: 'number' as const },
        limit: { type: 'number' as const },
      },
      // nothing required — model omits keys that don't apply
    },
    confidence: { type: 'number' as const },
    order: { type: 'integer' as const, minimum: 1, maximum: 4 },
    // status, candidates, unresolvedReason are NOT required — model omits when
    // not applicable. Zod defaults handle the missing case post-hoc.
    status: { type: 'string' as const, enum: ['resolved', 'unresolved'] },
    candidates: { type: 'array' as const, items: { type: 'string' as const } },
    unresolvedReason: { type: 'string' as const },
  },
  required: ['intent', 'entities', 'confidence', 'order'] as const,
};

// ─── Top-level response schema (multi-intent) ───────────────────────────
export const INTENT_RESPONSE_SCHEMA = {
  type: 'object' as const,
  properties: {
    intents: {
      type: 'array' as const,
      items: INTENT_ITEM_SCHEMA,
      minItems: 1,
      maxItems: 4,
    },
    conversationAct: { type: 'string' as const, enum: [...ConversationActSchema.options] },
  },
  required: ['intents', 'conversationAct'] as const,
};

export const REPLY_RESPONSE_SCHEMA = {
  type: 'object' as const,
  properties: {
    messages: {
      type: 'array' as const,
      items: { type: 'string' as const },
      minItems: 1,
      maxItems: 3,
    },
  },
  required: ['messages'] as const,
};
