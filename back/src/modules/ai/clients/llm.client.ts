export interface CallLLMParams {
  systemPrompt: string;
  userMessage: string;
  responseSchema?: object;
}
export type LLMClient = (params: CallLLMParams) => Promise<string>;
export { callLLM } from './gemini.client';