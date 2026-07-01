// Provider-agnostic contract (§3.1 "LLM Client"). Nothing outside this folder
// should import a provider SDK directly — always go through callLLM, so
// swapping Gemini -> OpenAI/Claude later is a one-line change here, not a
// rewrite of promptBuilder/agent.service.

export interface CallLLMParams {
  systemPrompt: string;
  userMessage: string;
}

// Raw text out — parsing/validation happens in parser/response.parser.ts,
// not here. Keep this layer dumb: send prompt, return text, log usage.
export type LLMClient = (params: CallLLMParams) => Promise<string>;

// Swap this one line to change providers app-wide.
export { callLLM } from './gemini.client';