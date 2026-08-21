import { GoogleGenAI } from '@google/genai';
import type { CallLLMParams, ContentPart } from './llm.client';
import { moduleLogger } from '../../../lib/logger';

const apiKeys = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter((key): key is string => Boolean(key));

if (apiKeys.length === 0) {
  throw new Error('No Gemini API keys are configured');
}

const MODEL_NAME = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash';

const clients = apiKeys.map((apiKey) => new GoogleGenAI({ apiKey }));

let currentClientIndex = 0;

/** Gemini inline media rejects MIME parameters. */
function cleanMimeType(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase();
}

/** Convert our ContentPart[] into Gemini's expected contents format. */
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

function getNextClient() {
  const client = clients[currentClientIndex];

  currentClientIndex =
    (currentClientIndex + 1) % clients.length;

  return client;
}

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const err = error as {
    status?: number;
    message?: string;
  };

  return (
    err.status === 429 ||
    err.message?.includes('quota') === true ||
    err.message?.includes('Quota exceeded') === true
  );
}

export async function callLLM({
  systemPrompt,
  userMessage,
  responseSchema,
  responseMimeType,
}: CallLLMParams): Promise<string> {
  const startedAt = Date.now();

  const resolvedMimeType =
    responseMimeType ??
    (responseSchema ? 'application/json' : 'text/plain');

  let lastError: unknown;

  for (let attempt = 0; attempt < clients.length; attempt++) {
    const client = getNextClient();

    try {
      const response = await client.models.generateContent({
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

      moduleLogger('llm').info({
        model: MODEL_NAME,
        latencyMs,
        promptTokens: usage?.promptTokenCount,
        completionTokens: usage?.candidatesTokenCount,
        attempt: attempt + 1,
      }, 'llm call completed');

      return response.text ?? '';
    } catch (error) {
      lastError = error;

      if (!isQuotaError(error)) {
        throw error;
      }

      moduleLogger('llm').warn({ attempt: attempt + 1, totalClients: clients.length }, 'Gemini quota exceeded, rotating API key');
    }
  }

  throw lastError;
}