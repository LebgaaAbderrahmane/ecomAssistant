import type { ToolResult, ToolExecutionContext } from '../tools/registry';
import type { ConversationMemory } from '../memory.types';

export type ToolResultEntry = { intent: string; result: ToolResult | null };

export type ToolExecutionOutcome = {
  toolResults: ToolResultEntry[];
  memory: ConversationMemory;
};

export type ExecutionContextShape = ToolExecutionContext;
