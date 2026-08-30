export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'audio'; data: Buffer; mimeType: string }
  | { type: 'image'; data: Buffer; mimeType: string };

export interface CallLLMContext {
  merchantId?: string;
  conversationId?: string;
  messageId?: string;
  /** Human-readable purpose/stage of the call, e.g. 'intent' | 'reply' | 'search' | 'caption' | 'transcription'. */
  purpose?: string;
}

export interface CallLLMParams {
  systemPrompt: string;
  userMessage: string | ContentPart[];
  responseSchema?: object;
  responseMimeType?: string;
  /** Attribution metadata recorded for token-consumption monitoring. */
  context?: CallLLMContext;
}

export type LLMClient = (params: CallLLMParams) => Promise<string>;
export { callLLM } from './gemini.client';
