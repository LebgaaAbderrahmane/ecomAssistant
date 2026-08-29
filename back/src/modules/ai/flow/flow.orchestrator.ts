import { msgLogger } from '../../../lib/logger';
import type { FlowResolverOutput } from './flowResolver.types';
import type { ConversationMemory } from '../memory.types';
import { createFlow } from './flowHelper';

export type FlowResolutionMode = 'inline' | 'deferred';

const suffix = (mode: FlowResolutionMode) => (mode === 'deferred' ? ' (deferred)' : '');

/** Applies a resolved flow action to the conversation memory, mutating it
 *  in place: creating a new flow and setting it active, switching/continuing
 *  to another existing flow, or leaving it unchanged. This is the single place
 *  that turns a FlowResolverOutput into memory changes — used by both the
 *  inline pipeline and the deferred Layer 2 path. */
export function applyFlowResolution(
  memory: ConversationMemory,
  resolverResult: FlowResolverOutput,
  log: ReturnType<typeof msgLogger>,
  mode: FlowResolutionMode = 'inline',
): void {
  const suffixStr = suffix(mode);

  switch (resolverResult.action) {
    case 'CREATE': {
      const newFlow = createFlow({
        productName: resolverResult.productName,
        filters: resolverResult.filters,
      });
      memory.flows.push(newFlow);
      memory.activeFlow = newFlow.flowId;
      log.info(
        { flowId: newFlow.flowId, productName: resolverResult.productName, totalFlows: memory.flows.length },
        `flow resolution: created new flow${suffixStr}`,
      );
      break;
    }
    case 'CONTINUE':
    case 'SWITCH':
      memory.activeFlow = resolverResult.flowId;
      log.info(
        { flowId: resolverResult.flowId, action: resolverResult.action },
        `flow resolution: switched/continued active flow${suffixStr}`,
      );
      break;
    case 'INVALID_ACTION':
      log.info(
        { reason: resolverResult.reason },
        `flow resolution: invalid action, intent may not execute${suffixStr}`,
      );
      break;
    case 'CLARIFY':
      log.info(
        { candidates: resolverResult.candidates.map(c => ({ flowId: c.flowId.slice(0, 8), score: c.score, summary: c.summary })) },
        `flow resolution: ambiguous, multiple flows match equally${suffixStr}`,
      );
      break;
    case 'NO_FLOW_LOOKUP':
      break;
  }
}
