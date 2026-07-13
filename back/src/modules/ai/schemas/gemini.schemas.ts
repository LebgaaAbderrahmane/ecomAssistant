import { IntentSchema, ConversationActSchema, ToolNameSchema } from './intents.schemas';

// Gemini's responseSchema uses a JSON-Schema-like format, not Zod directly —
// this constrains what the model generates. ai.schemas.ts (Zod) validates
// the result afterward. Two different schema systems for two different jobs:
// this one shapes generation, that one verifies it. Keep them in sync by hand
// when the intent/tool enums change.
export const INTENT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: [...IntentSchema.options] },
    conversationAct: { type: 'string', enum: [...ConversationActSchema.options] },
    entities: {
      type: 'object',
      properties: {
        product: { type: 'string' },
        orderId: { type: 'string' },
        wilaya: { type: 'string' },
        address: { type: 'string' },
        commune: { type: 'string' },
        quantity: { type: 'string' },
        productIndex: { type: 'number' },
      },
      // nothing required here — the model should omit keys that don't apply
    },
    confidence: { type: 'number' },
    toolSuggestion: {
      type: 'string',
      enum: [...ToolNameSchema.options],
      nullable: true,
    },
  },
  required: ['intent', 'conversationAct', 'entities', 'confidence'],
};

export const REPLY_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    response: { type: 'string' },
  },
  required: ['response'],
};