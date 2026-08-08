export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'audio'; data: Buffer; mimeType: string }
  | { type: 'image'; data: Buffer; mimeType: string };

export interface CallLLMParams {
  systemPrompt: string;
  userMessage: string | ContentPart[];
  responseSchema?: object;
  responseMimeType?: string;
}

export type LLMClient = (params: CallLLMParams) => Promise<string>;
export { callLLM } from './gemini.client';
