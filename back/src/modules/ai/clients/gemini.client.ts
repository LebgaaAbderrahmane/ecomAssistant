import { GoogleGenAI } from '@google/genai';
import type { CallLLMParams, ContentPart } from './llm.client';
import { moduleLogger } from '../../../lib/logger';
import { recordLlmUsage } from '../usage/llmUsage.service';

const apiKeys = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
  process.env.GEMINI_API_KEY_6,
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
  context,
}: CallLLMParams): Promise<string> {
  const startedAt = Date.now();

  const resolvedMimeType =
    responseMimeType ??
    (responseSchema ? 'application/json' : 'text/plain');

  let lastError: unknown;
  let lastAttempt = 0;

  for (let attempt = 0; attempt < clients.length; attempt++) {
    const client = getNextClient();
    lastAttempt = attempt + 1;

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
        purpose: context?.purpose,
      }, 'llm call completed');

      recordLlmUsage({
        ...(context ?? {}),
        model: MODEL_NAME,
        promptTokens: usage?.promptTokenCount ?? 0,
        completionTokens: usage?.candidatesTokenCount ?? 0,
        latencyMs,
        attempt: attempt + 1,
        success: true,
      });

      return response.text ?? '';
    } catch (error) {
      lastError = error;

      if (!isQuotaError(error)) {
        recordLlmUsage({
          ...(context ?? {}),
          model: MODEL_NAME,
          promptTokens: 0,
          completionTokens: 0,
          latencyMs: Date.now() - startedAt,
          attempt: lastAttempt,
          success: false,
        });
        throw error;
      }

      moduleLogger('llm').warn({ attempt: attempt + 1, totalClients: clients.length }, 'Gemini quota exceeded, rotating API key');
    }
  }

  recordLlmUsage({
    ...(context ?? {}),
    model: MODEL_NAME,
    promptTokens: 0,
    completionTokens: 0,
    latencyMs: Date.now() - startedAt,
    attempt: lastAttempt,
    success: false,
  });

  throw lastError;
}