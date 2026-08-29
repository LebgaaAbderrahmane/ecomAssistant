import { isSuggestedIntent } from '../schemas/intents.schemas';
import type { IntentField } from '../schemas/intents.schemas';
import type { Flow, FlowState } from '../memory.types';
import { moduleLogger } from '../../../lib/logger';
import {
  type IntentCategory,
  type FlowResolverEntities,
  type FlowResolverInput,
  type FlowResolverOutput,
  type FlowCandidate,
  STATE_INTENTS,
  QUERY_INTENTS,
  SIGNAL_WEIGHTS,
} from './flowResolver.types';

const log = moduleLogger('flowResolver');

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

// ---------------------------------------------------------------------------
// Intent classification for flow routing
// ---------------------------------------------------------------------------

/**
 * Maps LLM-extracted entity fields (generic Record) to the FlowResolverEntities
 * shape that resolveFlow expects.
 */
export function toFlowResolverEntities(
  entities: Record<string, string | number | boolean | null>,
): FlowResolverEntities {
  return {
    productName: (entities.productName ?? entities.product) as string | undefined,
    productRef: (entities.productRef ?? entities.product) as string | undefined,
    orderId: entities.orderId as string | undefined,
    orderRef: entities.orderRef as string | undefined,
    wilaya: entities.wilaya as string | undefined,
    commune: entities.commune as string | undefined,
    quantity: typeof entities.quantity === 'number' ? entities.quantity : undefined,
    reason: entities.reason as string | undefined,
  };
}

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

  const summary = buildFlowSummary(flow);
  log.debug(
    {
      flowId: flow.flowId.slice(0, 8),
      state: flow.state,
      product: 'productDiscovery' in flow ? flow.productDiscovery.input.productName : null,
      score,
      matchedSignals,
      productRef,
      summary,
    },
    'scoreFlow',
  );

  return {
    flowId: flow.flowId,
    score,
    matchedSignals,
    summary,
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

  log.info(
    {
      candidates: sorted.map((c) => ({
        flowId: c.flowId.slice(0, 8),
        score: c.score,
        signals: c.matchedSignals,
        summary: c.summary,
      })),
      activeFlowId: activeFlowId?.slice(0, 8) ?? null,
    },
    'pickAmongCandidates',
  );

  if (!second || top.score > second.score) {
    const action = top.flowId === activeFlowId ? 'CONTINUE' : 'SWITCH';
    log.info(
      { winnerFlowId: top.flowId.slice(0, 8), score: top.score, runnerUpScore: second?.score, action },
      'pickAmongCandidates: winner',
    );
    return action === 'CONTINUE'
      ? { action: 'CONTINUE', flowId: top.flowId }
      : { action: 'SWITCH', flowId: top.flowId };
  }

  const tied = sorted.filter((c) => c.score === top.score);
  log.info(
    { tied: tied.map((c) => c.flowId.slice(0, 8)), score: top.score },
    'pickAmongCandidates: CLARIFY (tied candidates)',
  );
  return { action: 'CLARIFY', candidates: tied };
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

export function resolveFlow(input: FlowResolverInput): FlowResolverOutput {
  const { extraction, conversation, refersToPreviousFlow } = input;
  const { intent, entities } = extraction;
  const { activeFlowId, flows } = conversation;

  log.info(
    {
      intent: String(intent),
      entities,
      activeFlowId: activeFlowId?.slice(0, 8) ?? null,
      flowCount: flows.length,
      refersToPreviousFlow: refersToPreviousFlow ?? false,
      flowSummaries: flows.map((f) => ({
        flowId: f.flowId.slice(0, 8),
        state: f.state,
        product: 'productDiscovery' in f ? f.productDiscovery.input.productName : null,
      })),
    },
    'resolveFlow: input',
  );

  // 1. Classify intent
  const category = classifyIntent(intent);
  log.debug({ intent: String(intent), category }, 'resolveFlow: classified');

  // 2. NO_FLOW_LOOKUP: intent doesn't need flow resolution
  if (category === 'NO_FLOW_LOOKUP') {
    log.debug({ intent: String(intent), category }, 'resolveFlow: NO_FLOW_LOOKUP');
    return { action: 'NO_FLOW_LOOKUP' };
  }

  // 3. No flows exist — create a new one
  if (flows.length === 0) {
    const productName = extractProductRef(entities) ?? 'unknown';
    log.info({ intent: String(intent), productName }, 'resolveFlow: CREATE (no flows exist)');
    return {
      action: 'CREATE',
      productName,
      filters: buildFilterFromEntities(entities),
    };
  }

  // 4. Find active flow.
  const activeFlow = activeFlowId
    ? flows.find((f) => f.flowId === activeFlowId)
    : undefined;

  if (!activeFlow) {
    log.info(
      { activeFlowId: activeFlowId?.slice(0, 8) ?? null, flowCount: flows.length },
      'resolveFlow: active flow not found, falling through to createOrScore',
    );
    return createOrScore(flows, entities, intent);
  }

  log.info(
    {
      activeFlowId: activeFlow.flowId.slice(0, 8),
      activeFlowState: activeFlow.state,
      activeFlowProduct: 'productDiscovery' in activeFlow ? activeFlow.productDiscovery.input.productName : null,
    },
    'resolveFlow: active flow found',
  );

  // 5. Active flow + STATE_INTENT
  if (category === 'STATE_INTENT') {
    const intentStr = intent as string;

    if (['PRODUCT_SEARCH', 'PRODUCT_SUGGEST'].includes(intentStr)) {
      if (activeFlow.state === 'ORDER_PENDING' || activeFlow.state === 'ORDER_CONFIRMED') {
        log.info({ intent: intentStr, activeState: activeFlow.state }, 'resolveFlow: CREATE (search during order)');
        return {
          action: 'CREATE',
          productName: extractProductRef(entities) ?? 'unknown',
          filters: buildFilterFromEntities(entities),
        };
      }
    }

    if (!isIntentCompatibleWithState(intentStr, activeFlow.state)) {
      // The intent doesn't fit the active flow. Check if the customer is
      // referring to a different existing flow before returning INVALID_ACTION.
      const productRef = extractProductRef(entities);
      if (productRef || refersToPreviousFlow) {
        const otherFlows = flows.filter((f) => f.flowId !== activeFlow.flowId);
        // When customer explicitly refers back, recency alone is enough (score ≥ 2).
        // Otherwise require explicitReference (score ≥ 3).
        const minScore = refersToPreviousFlow ? 2 : 3;
        const scored = otherFlows
          .map((f) => ({ flow: f, ...scoreFlow(f, entities, intent as string) }))
          .filter((c) => c.score >= minScore);

        log.info(
          {
            intent: intentStr,
            activeState: activeFlow.state,
            productRef: productRef ?? null,
            refersToPreviousFlow: refersToPreviousFlow ?? false,
            minScore,
            candidates: scored.map((c) => ({
              flowId: c.flow.flowId.slice(0, 8),
              score: c.score,
              signals: c.matchedSignals,
              product: 'productDiscovery' in c.flow ? c.flow.productDiscovery.input.productName : null,
            })),
          },
          'resolveFlow: STATE_INTENT incompatible, checking other flows',
        );

        if (scored.length === 1) {
          log.info(
            { switchTo: scored[0].flow.flowId.slice(0, 8), score: scored[0].score, signals: scored[0].matchedSignals },
            'resolveFlow: SWITCH (state intent, different flow matches)',
          );
          return { action: 'SWITCH', flowId: scored[0].flow.flowId };
        }

        if (scored.length > 1) {
          const winner = pickAmongCandidates(scored, activeFlow.flowId);
          if (winner.action === 'SWITCH') {
            log.info(
              { switchTo: winner.flowId, reason: 'multiple matches, best score' },
              'resolveFlow: SWITCH (state intent, best match)',
            );
            return winner;
          }
          // pickAmongCandidates returned CLARIFY — fall through
          log.info(
            { candidates: scored.map((c) => ({ flowId: c.flow.flowId.slice(0, 8), score: c.score })) },
            'resolveFlow: CLARIFY (multiple other flows match)',
          );
          return winner;
        }
      }

      log.info(
        { intent: intentStr, state: activeFlow.state, flowId: activeFlow.flowId.slice(0, 8) },
        'resolveFlow: INVALID_ACTION',
      );
      return {
        action: 'INVALID_ACTION',
        reason: `Cannot ${intentStr.toLowerCase()} in state ${activeFlow.state}`,
      };
    }

    log.info({ intent: intentStr, flowId: activeFlow.flowId.slice(0, 8), state: activeFlow.state }, 'resolveFlow: CONTINUE (state intent on active flow)');
    return { action: 'CONTINUE', flowId: activeFlow.flowId };
  }

  // 6. Active flow + QUERY_INTENT
  if (category === 'QUERY_INTENT') {
    const productRef = extractProductRef(entities);

    log.info(
      { intent: String(intent), productRef, activeFlowState: activeFlow.state },
      'resolveFlow: QUERY_INTENT',
    );

    if (productRef) {
      const scored = flows
        .map((f) => scoreFlow(f, entities, intent as string))
        .filter((c) => c.matchedSignals.includes('explicitReference'));

      log.info(
        {
          matchedFlows: scored.map((c) => ({
            flowId: c.flowId.slice(0, 8),
            score: c.score,
            signals: c.matchedSignals,
            summary: c.summary,
          })),
          totalFlows: flows.length,
          productRef,
        },
        'resolveFlow: QUERY_INTENT scored candidates with explicitReference',
      );

      if (scored.length === 0) {
        log.info({ productRef }, 'resolveFlow: CREATE (product matches no existing flow)');
        return {
          action: 'CREATE',
          productName: productRef,
          filters: buildFilterFromEntities(entities),
        };
      }

      return pickAmongCandidates(scored, activeFlow.flowId);
    }

    if (['PRODUCT_SEARCH', 'PRODUCT_SUGGEST'].includes(intent as string)) {
      if (activeFlow.state === 'ORDER_PENDING' || activeFlow.state === 'ORDER_CONFIRMED') {
        log.info({ intent, activeState: activeFlow.state }, 'resolveFlow: CREATE (search/suggest without ref during order)');
        return {
          action: 'CREATE',
          productName: 'unknown',
          filters: buildFilterFromEntities(entities),
        };
      }
    }

    log.info({ intent: String(intent), flowId: activeFlow.flowId.slice(0, 8), state: activeFlow.state }, 'resolveFlow: CONTINUE (no product ref, use active flow)');
    return { action: 'CONTINUE', flowId: activeFlow.flowId };
  }

  log.warn({ intent: String(intent) }, 'resolveFlow: CREATE (fallback)');
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
    log.info({ intent: 'suggested' }, 'createOrScore: CREATE (suggested intent)');
    return {
      action: 'CREATE',
      productName: extractProductRef(entities) ?? 'unknown',
      filters: buildFilterFromEntities(entities),
    };
  }

  const scored = flows.map((f) => scoreFlow(f, entities, intentStr));

  log.info(
    {
      candidates: scored.map((c) => ({
        flowId: c.flowId.slice(0, 8),
        score: c.score,
        signals: c.matchedSignals,
        summary: c.summary,
      })),
    },
    'createOrScore: scored all candidates',
  );

  const hasExplicit = scored.some((c) => c.matchedSignals.includes('explicitReference'));
  if (!hasExplicit) {
    log.info({ intent: intentStr }, 'createOrScore: CREATE (no explicit product match in any flow)');
    return {
      action: 'CREATE',
      productName: extractProductRef(entities) ?? 'unknown',
      filters: buildFilterFromEntities(entities),
    };
  }

  log.debug({ intent: intentStr }, 'createOrScore: picking among candidates');
  return pickAmongCandidates(scored, undefined);
}

function buildFilterFromEntities(
  entities: FlowResolverInput['extraction']['entities'],
): { category?: string; color?: string; size?: string; minPrice?: number; maxPrice?: number; freeText?: string } {
  return {
    freeText: entities.productName ?? entities.productRef,
  };
}