import { z } from 'zod';
import { IntentSchema, ConversationActSchema, ToolNameSchema } from './intents.schemas';

// Entities are intentionally loose at this layer — each tool tightens its own
// argument shape via its own Zod schema (§7.2). This just guards against the
// LLM returning nested objects/arrays we don't expect.
export const EntitiesSchema = z
  .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .default({});

export const LLMResponseSchema = z.object({
  intent: IntentSchema,
  conversationAct: ConversationActSchema,
  entities: EntitiesSchema,
  confidence: z.number().min(0).max(1),
  // null when the turn doesn't need a tool (e.g. small talk, clarification)
  toolSuggestion: ToolNameSchema.nullable().default(null),
});

export const ReplyResponseSchema = z.object({
  response: z.string().min(1),
});

export type ReplyResponse = z.infer<typeof ReplyResponseSchema>;
export type LLMResponse = z.infer<typeof LLMResponseSchema>;
