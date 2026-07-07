import { GoogleGenAI } from '@google/genai';
import type { CallLLMParams } from './llm.client';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('GEMINI_API_KEY is not set');
}

// Updated fallback to the latest stable production model (gemini-3.5-flash)
const MODEL_NAME = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash';

// Instantiates with an options object. Falls back to process.env.GEMINI_API_KEY naturally if left empty.
const ai = new GoogleGenAI({ apiKey });

export async function callLLM({ systemPrompt, userMessage, responseSchema }: CallLLMParams): Promise<string> {
  const startedAt = Date.now();
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: userMessage,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      ...(responseSchema ? { responseSchema } : {}),
      temperature: 0.4,
    },
  });
  const latencyMs = Date.now() - startedAt;
  const usage = response.usageMetadata;
  console.log('[llm.call]', {
    model: MODEL_NAME,
    latencyMs,
    promptTokens: usage?.promptTokenCount,
    completionTokens: usage?.candidatesTokenCount,
  });
  return response.text ?? '';
}