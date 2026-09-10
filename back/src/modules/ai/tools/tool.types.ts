import type { Flow } from '../memory.types';

export interface ToolExecutionContext {
  merchantId: string;
  customerId: string;
  conversationId: string;
  activeFlow: Flow | null;
  customerWilaya?: string | null;
  customerCommune?: string | null;
}

// Outcome refines `success`. It lets downstream code treat two very different
// failures distinctly:
//   - NOT_FOUND  → the item definitively does not exist (search came back empty).
//   - AMBIGUOUS  → the request is too vague to identify an item (ask to clarify).
// Absent on plain operational failures (bad args, missing context, infra errors).
export type ToolOutcome = 'SUCCESS' | 'NOT_FOUND' | 'AMBIGUOUS';

export interface ToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  outcome?: ToolOutcome;
}

export type ToolEntities = Record<string, string | number | boolean | null>;
export type ToolHandler = (entities: ToolEntities, ctx: ToolExecutionContext) => Promise<ToolResult>;
