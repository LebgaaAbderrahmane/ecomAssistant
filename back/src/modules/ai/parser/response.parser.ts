import { LLMResponseSchema, ReplyResponseSchema, type LLMResponse, type ReplyResponse } from '../schemas/ai.schemas';
import { z } from 'zod';

export class LLMParseError extends Error {
  constructor(public raw: string, public cause: unknown) {
    super('Failed to parse LLM response');
  }
}

function stripFences(text: string): string {
  return text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
}

function parseWithSchema<S extends z.ZodTypeAny>(raw: string, schema: S): z.infer<S> {
  const cleaned = stripFences(raw);
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch (err) {
    throw new LLMParseError(raw, err);
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new LLMParseError(raw, result.error);
  }
  return result.data;
}

export function parseResponse(raw: string): LLMResponse {
  return parseWithSchema(raw, LLMResponseSchema);
}

export function parseReplyResponse(raw: string): ReplyResponse {
  return parseWithSchema(raw, ReplyResponseSchema);
}