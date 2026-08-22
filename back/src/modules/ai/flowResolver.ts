import { isSuggestedIntent } from './schemas/intents.schemas';
import type { IntentField } from './schemas/intents.schemas';
import type { Flow, FlowState } from './memory.types';
import {
  type IntentCategory,
  type FlowResolverInput,
  type FlowResolverOutput,
  type FlowCandidate,
  STATE_INTENTS,
  QUERY_INTENTS,
  SIGNAL_WEIGHTS,
} from './flowResolver.types';

// ---------------------------------------------------------------------------
// Intent classification
//
// NOTE: STATE_INTENTS / QUERY_INTENTS (global classification, in
// flowResolver.types) and isIntentCompatibleWithState (per-state
// compatibility, below) are two separate axes that both need updating when
// a new intent is added — nothing enforces they agree. Worth collapsing
// into one registry at some point; left alone here since it touches a file
// this pass doesn't have visibility into.
// ---------------------------------------------------------------------------

export function classifyIntent(intent: IntentField): IntentCategory {
  if (isSuggestedIntent(intent)) return 'NO_FLOW_LOOKUP';
  if (STATE_INTENTS.has(intent)) return 'STATE_INTENT';
  if (QUERY_INTENTS.has(intent)) return 'QUERY_INTENT';
  return 'NO_FLOW_LOOKUP';
}

// ---------------------------------------------------------------------------
// State compatibility
// ---------------------------------------------------------------------------

function isIntentCompatibleWithState(intent: string, state: FlowState): boolean {
  switch (state) {
    case 'PRODUCT_DISCOVERY':
      return ['PRODUCT_SEARCH', 'PRODUCT_SELECT', 'PRODUCT_DETAILS', 'PRODUCT_SUGGEST'].includes(intent);
    case 'PRODUCT_SELECTED':
      return ['PRODUCT_DETAILS', 'ORDER_CREATE', 'SHIPPING_CHECK'].includes(intent);
    case 'ORDER_PENDING':
      return ['ORDER_CONFIRM', 'ORDER_MODIFY', 'ORDER_CANCEL', 'SHIPPING_CHECK', 'STATUS_CHECK'].includes(intent);
    case 'ORDER_CONFIRMED':
      return ['SHIPPING_CHECK', 'STATUS_CHECK'].includes(intent);
    case 'ORDER_SHIPPED':
      return ['STATUS_CHECK'].includes(intent);
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Flow scoring
// ---------------------------------------------------------------------------

// Tune to how long a flow should stay "warm" before recency stops
// meaningfully favoring it over an older sibling flow.
const RECENCY_HALF_LIFE_MS = 30 * 60 * 1000; // 30 minutes

function extractProductRef(entities: FlowResolverInput['extraction']['entities']): string | undefined {
  return entities.productName ?? entities.productRef;
}

function buildFlowSummary(flow: Flow): string {
  switch (flow.state) {
    case 'IDLE':
      return `Flow ${flow.flowId.slice(0, 8)}`;
    case 'PRODUCT_DISCOVERY': {
      const name = flow.productDiscovery.input.productName;
      const count = flow.productDiscovery.toolResults.length;
      return count > 0 ? `${name} (${count} results)` : name;
    }
    case 'PRODUCT_SELECTED': {
      const name = flow.productDiscovery.input.productName;
      return `Selected: ${name}`;
    }
    case 'ORDER_PENDING': {
      const name = flow.productDiscovery.input.productName;
      const qty = flow.order.quantity ?? 1;
      return `Order: ${name} x${qty}`;
    }
    case 'ORDER_CONFIRMED': {
      const name = flow.productDiscovery.input.productName;
      return `Confirmed: ${name}`;
    }
    case 'ORDER_SHIPPED': {
      const name = flow.productDiscovery.input.productName;
      return `Shipped: ${name}`;
    }
    case 'ORDER_CANCELLED': {
      const name = flow.productDiscovery.input.productName;
      return `Cancelled: ${name}`;
    }
    case 'FINISHED': {
      const name = flow.productDiscovery.input.productName;
      return `Finished: ${name}`;
    }
    default:
      // Exhaustiveness check: adding a new FlowState without a case above
      // becomes a compile error here instead of silently falling through.
      return assertNever(flow);
  }
}

function assertNever(x: never): never {
  throw new Error(`buildFlowSummary: unhandled flow state: ${JSON.stringify(x)}`);
}

export function scoreFlow(
  flow: Flow,
  entities: FlowResolverInput['extraction']['entities'],
  intent: string,
): FlowCandidate {
  let score = 0;
  const matchedSignals: string[] = [];

  const productRef = extractProductRef(entities);

  // explicitReference (+3): product name matches flow's product
  if (productRef && flow.state !== 'IDLE' && flow.state !== 'FINISHED') {
    const flowProduct = flow.productDiscovery.input.productName.toLowerCase();
    const ref = productRef.toLowerCase();
    if (flowProduct.includes(ref) || ref.includes(flowProduct)) {
      score += SIGNAL_WEIGHTS.explicitReference;
      matchedSignals.push('explicitReference');
    }
  }

  // recency: decays with age since flow.updatedAt rather than a flat bonus,
  // so it actually discriminates between an old flow and a fresh one
  // instead of adding the same constant to every candidate.
  const ageMs = Date.now() - new Date(flow.updatedAt).getTime();
  const recencyFactor = Math.pow(0.5, ageMs / RECENCY_HALF_LIFE_MS);
  const recencyScore = SIGNAL_WEIGHTS.recency * recencyFactor;
  score += recencyScore;
  if (recencyFactor > 0.5) {
    // Only tag it as a "matched" signal once it's still meaningfully fresh
    // (within one half-life) — otherwise every flow would show 'recency'
    // in matchedSignals even when it contributed almost nothing.
    matchedSignals.push('recency');
  }

  // entityOverlap (+1): wilaya mentioned in the message actually matches
  // this flow's shipping address, rather than just co-occurring with any
  // order-bearing flow.
  if (entities.wilaya && 'shipping' in flow && flow.shipping?.address) {
    const wilaya = entities.wilaya.toLowerCase();
    const address = flow.shipping.address.toLowerCase();
    if (address.includes(wilaya)) {
      score += SIGNAL_WEIGHTS.entityOverlap;
      matchedSignals.push('entityOverlap');
    }
  }

  // stateMatch (+1): intent naturally continues this flow's state
  if (isIntentCompatibleWithState(intent, flow.state)) {
    score += SIGNAL_WEIGHTS.stateMatch;
    matchedSignals.push('stateMatch');
  }

  return {
    flowId: flow.flowId,
    score,
    matchedSignals,
    summary: buildFlowSummary(flow),
  };
}

// ---------------------------------------------------------------------------
// Candidate selection
//
// Shared by both places that turn a scored candidate list into a resolver
// action, so CONTINUE/SWITCH vs. CLARIFY uses one consistent rule: only an
// exact tie at the top asks the user to disambiguate. (Previously step 8
// asked to clarify whenever 2+ flows had an explicit match at all, even
// with a clear score leader — inconsistent with createOrScore's stricter
// tie-only rule. CLARIFY candidates are also now just the tied leaders,
// not the full scored list.)
// ---------------------------------------------------------------------------

function pickAmongCandidates(
  scored: FlowCandidate[],
  activeFlowId: string | undefined,
): FlowResolverOutput {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const [top, second] = sorted;

  if (!second || top.score > second.score) {
    return top.flowId === activeFlowId
      ? { action: 'CONTINUE', flowId: top.flowId }
      : { action: 'SWITCH', flowId: top.flowId };
  }

  const tied = sorted.filter((c) => c.score === top.score);
  return { action: 'CLARIFY', candidates: tied };
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

export function resolveFlow(input: FlowResolverInput): FlowResolverOutput {
  const { extraction, conversation } = input;
  const { intent, entities } = extraction;
  const { activeFlowId, flows } = conversation;

  // 1. Classify intent
  const category = classifyIntent(intent);

  // 2. NO_FLOW_LOOKUP: intent doesn't need flow resolution
  if (category === 'NO_FLOW_LOOKUP') {
    return { action: 'NO_FLOW_LOOKUP' };
  }

  // 3. No flows exist — create a new one
  if (flows.length === 0) {
    return {
      action: 'CREATE',
      productName: extractProductRef(entities) ?? 'unknown',
      filters: buildFilterFromEntities(entities),
    };
  }

  // 4. Find active flow. Covers both "no activeFlowId set" and
  //    "activeFlowId points at a flow that no longer exists" — both fall
  //    through to createOrScore identically, so there's no need for them
  //    to be two separate branches.
  const activeFlow = activeFlowId
    ? flows.find((f) => f.flowId === activeFlowId)
    : undefined;

  if (!activeFlow) {
    return createOrScore(flows, entities, intent);
  }

  // 5. Active flow + STATE_INTENT
  if (category === 'STATE_INTENT') {
    const intentStr = intent as string;

    // PRODUCT_SEARCH/SUGGEST while in ORDER_PENDING/CONFIRMED -> CREATE new
    // flow. Kept ahead of the compatibility gate below on purpose: if
    // these become STATE_INTENTs, they still aren't in either state's
    // compatible-intent list, so the gate would otherwise reject them as
    // INVALID_ACTION before this override ever ran.
    if (['PRODUCT_SEARCH', 'PRODUCT_SUGGEST'].includes(intentStr)) {
      if (activeFlow.state === 'ORDER_PENDING' || activeFlow.state === 'ORDER_CONFIRMED') {
        return {
          action: 'CREATE',
          productName: extractProductRef(entities) ?? 'unknown',
          filters: buildFilterFromEntities(entities),
        };
      }
    }

    // Any state-mutating intent not valid for the current state ->
    // INVALID_ACTION. Driven by the same compatibility table used for
    // stateMatch scoring, so e.g. ORDER_CANCEL on an already-ORDER_SHIPPED
    // flow is now correctly rejected instead of silently falling through
    // to CONTINUE.
    if (!isIntentCompatibleWithState(intentStr, activeFlow.state)) {
      return {
        action: 'INVALID_ACTION',
        reason: `Cannot ${intentStr.toLowerCase()} in state ${activeFlow.state}`,
      };
    }

    // Otherwise CONTINUE on the active flow
    return { action: 'CONTINUE', flowId: activeFlow.flowId };
  }

  // 6. Active flow + QUERY_INTENT
  if (category === 'QUERY_INTENT') {
    const productRef = extractProductRef(entities);

    // Product reference present — check which flow it matches
    if (productRef) {
      const scored = flows
        .map((f) => scoreFlow(f, entities, intent as string))
        .filter((c) => c.matchedSignals.includes('explicitReference'));

      if (scored.length === 0) {
        // Product matches nothing — CREATE
        return {
          action: 'CREATE',
          productName: productRef,
          filters: buildFilterFromEntities(entities),
        };
      }

      return pickAmongCandidates(scored, activeFlow.flowId);
    }

    // No product reference — user likely refers to the current flow context
    // But PRODUCT_SEARCH/PRODUCT_SUGGEST while in ORDER_PENDING/CONFIRMED means new search
    if (['PRODUCT_SEARCH', 'PRODUCT_SUGGEST'].includes(intent as string)) {
      if (activeFlow.state === 'ORDER_PENDING' || activeFlow.state === 'ORDER_CONFIRMED') {
        return {
          action: 'CREATE',
          productName: 'unknown',
          filters: buildFilterFromEntities(entities),
        };
      }
    }

    // Active flow has a product or order — continue on it
    return { action: 'CONTINUE', flowId: activeFlow.flowId };
  }

  // Fallback
  return {
    action: 'CREATE',
    productName: extractProductRef(entities) ?? 'unknown',
    filters: buildFilterFromEntities(entities),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function createOrScore(
  flows: Flow[],
  entities: FlowResolverInput['extraction']['entities'],
  intent: IntentField,
): FlowResolverOutput {
  const intentStr = isSuggestedIntent(intent) ? null : intent;
  if (!intentStr) {
    return {
      action: 'CREATE',
      productName: extractProductRef(entities) ?? 'unknown',
      filters: buildFilterFromEntities(entities),
    };
  }

  const scored = flows.map((f) => scoreFlow(f, entities, intentStr));

  // Without an explicit product match, recency + stateMatch alone aren't
  // enough confidence to guess which flow the user means.
  const hasExplicit = scored.some((c) => c.matchedSignals.includes('explicitReference'));
  if (!hasExplicit) {
    return {
      action: 'CREATE',
      productName: extractProductRef(entities) ?? 'unknown',
      filters: buildFilterFromEntities(entities),
    };
  }

  // No active flow in this path, so the result is always SWITCH (or
  // CLARIFY on a tie) — never CONTINUE.
  return pickAmongCandidates(scored, undefined);
}

function buildFilterFromEntities(
  entities: FlowResolverInput['extraction']['entities'],
): { category?: string; color?: string; size?: string; minPrice?: number; maxPrice?: number; freeText?: string } {
  return {
    freeText: entities.productName ?? entities.productRef,
  };
}