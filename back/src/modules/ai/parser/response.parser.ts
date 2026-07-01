import { LLMResponseSchema, type LLMResponse } from '../schemas/ai.schemas';

export class LLMParseError extends Error {
  constructor(public raw: string, public cause: unknown) {
    super('Failed to parse LLM response');
  }
}

// Even with responseMimeType: 'application/json', some providers/models still
// wrap output in ```json fences occasionally — strip defensively.
function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(json)?/i, '')
    .replace(/```$/, '')
    .trim();
}

export function parseResponse(raw: string): LLMResponse {
  const cleaned = stripFences(raw);

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch (err) {
    throw new LLMParseError(raw, err);
  }

  const result = LLMResponseSchema.safeParse(json);
  if (!result.success) {
    throw new LLMParseError(raw, result.error);
  }

  return result.data;
}