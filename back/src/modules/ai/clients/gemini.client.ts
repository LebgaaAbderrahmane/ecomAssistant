import { GoogleGenAI } from '@google/genai';
import type { CallLLMParams, ContentPart } from './llm.client';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('GEMINI_API_KEY is not set');
}

const MODEL_NAME = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash';

const ai = new GoogleGenAI({ apiKey });

/** Gemini inline media rejects MIME parameters (e.g. "audio/ogg; codecs=opus"). */
function cleanMimeType(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase();
}

/** Convert our ContentPart[] (or plain string) into Gemini's expected contents format. */
function toGeminiContents(userMessage: string | ContentPart[]) {
  if (typeof userMessage === 'string') {
    return userMessage;
  }
  return userMessage.map((part: ContentPart) => {
    if (part.type === 'text') {
      return { text: part.text };
    }
    return {
      inlineData: {
        mimeType: cleanMimeType(part.mimeType),
        data: part.data.toString('base64'),
      },
    };
  });
}

export async function callLLM({ systemPrompt, userMessage, responseSchema, responseMimeType }: CallLLMParams): Promise<string> {
  const startedAt = Date.now();

  const resolvedMimeType = responseMimeType ?? (responseSchema ? 'application/json' : 'text/plain');

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: toGeminiContents(userMessage),
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: resolvedMimeType,
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
