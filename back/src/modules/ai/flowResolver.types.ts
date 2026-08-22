import type { IntentField } from './schemas/intents.schemas';
import type { Flow, FlowFilter } from './memory.types';

// ---------------------------------------------------------------------------
// Intent classification for flow routing
// ---------------------------------------------------------------------------

export type IntentCategory = 'STATE_INTENT' | 'QUERY_INTENT' | 'NO_FLOW_LOOKUP';

/** Intents that mutate the order lifecycle (state transitions). */
export const STATE_INTENTS = new Set<string>([
  'ORDER_CREATE',
  'ORDER_CONFIRM',
  'ORDER_MODIFY',
  'ORDER_CANCEL',
]);

/** Intents that query product or order information (read-only). */
export const QUERY_INTENTS = new Set<string>([
  'PRODUCT_SEARCH',
  'PRODUCT_SELECT',
  'PRODUCT_DETAILS',
  'PRODUCT_SUGGEST',
  'SHIPPING_CHECK',
  'STATUS_CHECK',
]);

// ---------------------------------------------------------------------------
// FlowResolverInput
// ---------------------------------------------------------------------------

export interface FlowResolverEntities {
  productRef?: string;
  productName?: string;
  orderRef?: string;
  orderId?: string;
  confirmationSignal?: 'confirm' | 'cancel' | 'modify' | null;
  quantity?: number;
  wilaya?: string;
  commune?: string;
  reason?: string;
}

export interface FlowResolverInput {
  extraction: {
    intent: IntentField;
    entities: FlowResolverEntities;
    confidence: number;
  };
  conversation: {
    activeFlowId: string | null;
    flows: Flow[];
  };
}

// ---------------------------------------------------------------------------
// FlowResolverOutput (discriminated union)
// ---------------------------------------------------------------------------

export interface FlowResolverOutputContinue {
  action: 'CONTINUE';
  flowId: string;
}

export interface FlowResolverOutputSwitch {
  action: 'SWITCH';
  flowId: string;
}

export interface FlowResolverOutputCreate {
  action: 'CREATE';
  productName: string;
  filters: FlowFilter;
}

export interface FlowResolverOutputClarify {
  action: 'CLARIFY';
  candidates: FlowCandidate[];
}

export interface FlowResolverOutputInvalidAction {
  action: 'INVALID_ACTION';
  reason: string;
}

export interface FlowResolverOutputNoFlowLookup {
  action: 'NO_FLOW_LOOKUP';
}

export type FlowResolverOutput =
  | FlowResolverOutputContinue
  | FlowResolverOutputSwitch
  | FlowResolverOutputCreate
  | FlowResolverOutputClarify
  | FlowResolverOutputInvalidAction
  | FlowResolverOutputNoFlowLookup;

// ---------------------------------------------------------------------------
// FlowCandidate (for CLARIFY disambiguation)
// ---------------------------------------------------------------------------

export interface FlowCandidate {
  flowId: string;
  score: number;
  matchedSignals: string[];
  summary: string;
}

/** Signal weights for flow scoring. */
export const SIGNAL_WEIGHTS = {
  explicitReference: 3,
  recency: 2,
  entityOverlap: 1,
  stateMatch: 1,
} as const;
