import type { Prisma } from '@prisma/client';
import prisma from '../../../config/db.config';
import { msgLogger } from '../../../lib/logger';
import { migrateMemory, getActiveFlow } from '../flow/flowHelper';
import {
  resolveTool,
  isReadTool,
  isWriteTool,
  intentToString,
} from '../schemas/intents.schemas';
import type { IntentItem } from '../schemas/ai.schemas';
import { executeTool, ToolResult } from '../tools/registry';
import type { ConversationMemory } from '../memory.types';
import {
  resolveProductId,
  resolveProductContext,
  applyToolToFlow,
} from './product.context';
import type { ToolResultEntry, ToolExecutionOutcome } from './execution.types';

// Product intents whose tools resolve references from conversation memory.
// They are excluded from the "unresolved" short-circuit so the tool — not the
// intent extractor — decides NOT_FOUND vs AMBIGUOUS using memory + catalog.
const PRODUCT_INTENTS = new Set(['PRODUCT_SEARCH', 'PRODUCT_SELECT', 'PRODUCT_DETAILS', 'PRODUCT_SUGGEST']);

// ─── Layer 2, step 1: tool execution ────────────────────────────────────
// Runs the backend functions for the message's intents and returns the results
// plus the memory state the reply needs. `opts.only` restricts which tools run:
// during human takeover, write tools execute immediately while read tools are
// deferred and handled separately.
export async function executeTools(
  messageId: string,
  sortedIntents: IntentItem[],
  opts: { only?: 'read' | 'write' } = {},
): Promise<ToolExecutionOutcome> {
  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { conversation: true },
  });
  const { conversation } = message;
  const memory = migrateMemory(conversation.memory);

  const log = msgLogger({ conversationId: conversation.id, messageId });

  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: conversation.customerId },
  });

  const activeFlow = getActiveFlow(memory) ?? null;
  const executionContext = {
    merchantId: conversation.merchantId,
    customerId: conversation.customerId,
    conversationId: conversation.id,
    activeFlow,
    customerWilaya: customer.wilaya,
    customerCommune: customer.commune,
  };

  const intents = opts.only
    ? sortedIntents.filter((item) => {
        const toolName = resolveTool(item.intent, item.entities);
        if (!toolName) return false;
        return opts.only === 'read' ? isReadTool(toolName) : isWriteTool(toolName);
      })
    : sortedIntents;

  // ─── Entity enrichment + tool execution loop ─────────────────────────
  const toolResults: ToolResultEntry[] = [];
  const toolResultCache = new Map<string, ToolResult | null>();
  // Whether an exact product request (search/recall) succeeded this message.
  // When true, paired suggestions are skipped — a search that matched what the
  // customer asked needs no recommendation on top.
  let searchSucceededThisMessage = false;
  // suggestProducts intents are executed after the main loop so the outcome of
  // a paired PRODUCT_SEARCH is already known before deciding to recommend.
  const deferredSuggestions: Array<{
    item: IntentItem;
    entities: Record<string, string | number | boolean | null>;
    toolKey: string;
  }> = [];

  for (const item of intents) {
    // Product intents are never short-circuited on "unresolved": their tools
    // (searchProducts / selectProduct / getProductDetails / suggestProducts)
    // resolve the reference from conversation memory first and only report
    // AMBIGUOUS when neither the message nor the memory can identify a product.
    // Other intents that the LLM could not act on are recorded as AMBIGUOUS and skipped.
    if (item.status === 'unresolved' && !PRODUCT_INTENTS.has(intentToString(item.intent))) {
      toolResults.push({
        intent: intentToString(item.intent),
        result: {
          success: false,
          outcome: 'AMBIGUOUS',
          error: item.unresolvedReason ?? 'The request is too vague to act on. Ask the customer to clarify what they mean.',
        },
      });
      continue;
    }

    // Resolve tool from intent
    let toolName = resolveTool(item.intent, item.entities);
    if (!toolName) {
      toolResults.push({ intent: intentToString(item.intent), result: null });
      continue;
    }

    // Enrich productId from product name (for intents that have a product entity)
    const entities = { ...item.entities };
    if (entities.product && !entities.productId) {
      const resolvedId = await resolveProductId(conversation.merchantId, entities.product as string);
      if (resolvedId) {
        entities.productId = resolvedId;
        log.info({ productId: resolvedId, productName: entities.product }, 'resolved productId from name');
      }
    }

    // Pre-process: resolve product context (auto-select or redirect to search)
    const resolved = await resolveProductContext(item.intent, entities, executionContext, log);
    item.intent = resolved.intent;
    Object.assign(entities, resolved.entities);
    const finalToolName = resolveTool(item.intent, entities);
    if (finalToolName && finalToolName !== toolName) {
      toolName = finalToolName;
    }

    // Dedupe identical tool calls within one message (e.g. LLM #1 emitting the
    // same PRODUCT_SEARCH twice) — never burn a second DB/LLM call on it.
    const toolKey = `${toolName}:${JSON.stringify(entities)}`;

    // Suggestions run last, after every other intent (see below).
    if (toolName === 'suggestProducts') {
      deferredSuggestions.push({ item, entities, toolKey });
      continue;
    }

    if (toolResultCache.has(toolKey)) {
      const cached = toolResultCache.get(toolKey) ?? null;
      toolResults.push({ intent: intentToString(item.intent), result: cached });
      continue;
    }

    // Execute tool with per-intent error handling
    let result: ToolResult;
    try {
      log.info(
        {
          tool: toolName,
          intent: intentToString(item.intent),
          entities,
          activeFlowId: executionContext.activeFlow?.flowId.slice(0, 8) ?? null,
          activeFlowState: executionContext.activeFlow?.state ?? null,
        },
        'tool: executing',
      );
      result = await executeTool(toolName, entities, executionContext);
      const productCount = Array.isArray(result.data?.products) ? (result.data.products as unknown[]).length : undefined;
      log.info(
        {
          tool: toolName,
          intent: intentToString(item.intent),
          outcome: result.outcome ?? (result.success ? 'SUCCESS' : 'FAIL'),
          productCount,
          error: result.error,
          data: productCount !== undefined ? undefined : result.data,
        },
        'tool: executed',
      );
    } catch (err) {
      log.error({ tool: toolName, intent: intentToString(item.intent), err }, 'tool: threw');
      result = { success: false, error: 'Tool execution failed' };
    }
    toolResultCache.set(toolKey, result);

    toolResults.push({ intent: intentToString(item.intent), result });

    // Apply tool result to active flow (state transitions + data recording).
    if (executionContext.activeFlow && result) {
      const updated = applyToolToFlow(executionContext.activeFlow, toolName, result);
      if (updated && updated !== executionContext.activeFlow) {
        log.info(
          {
            tool: toolName,
            from: executionContext.activeFlow.state,
            to: updated.state,
            flowId: updated.flowId.slice(0, 8),
          },
          'flow: state transition from tool',
        );
        executionContext.activeFlow = updated;
        const idx = memory.flows.findIndex((f) => f.flowId === updated.flowId);
        if (idx >= 0) memory.flows[idx] = updated;
      }
    }

    // Store search results on message entities for backward compatibility.
    if (
      (toolName === 'searchProducts' || toolName === 'recallPreviousProducts') &&
      result.success &&
      result.data?.products &&
      Array.isArray(result.data.products)
    ) {
      const productsArray = result.data.products as Array<{ id: string; name: string; price?: number }>;
      const productsList = productsArray.map((p) => ({ id: p.id, name: p.name }));

      await prisma.message.update({
        where: { id: messageId },
        data: {
          entities: {
            ...(entities as Record<string, unknown>),
            products: productsList,
          } as Prisma.InputJsonValue,
        },
      });

      searchSucceededThisMessage = true;
      log.info({ count: productsList.length }, 'stored products in message entities');
    }
  }

  // ─── Deferred suggestions ────────────────────────────────────────────
  // Run PRODUCT_SUGGEST after every other intent so a paired search's outcome
  // is known. If the exact search already returned results, skip the
  // recommendation — never suggest merely because a search succeeded.
  for (const { item, entities, toolKey } of deferredSuggestions) {
    if (searchSucceededThisMessage) {
      toolResults.push({ intent: intentToString(item.intent), result: null });
      continue;
    }

    let result: ToolResult;
    if (toolResultCache.has(toolKey)) {
      result = toolResultCache.get(toolKey) as ToolResult;
    } else {
      try {
        result = await executeTool('suggestProducts', entities, executionContext);
        const sugCount = Array.isArray(result.data?.products) ? (result.data.products as unknown[]).length : undefined;
        log.info(
          {
            tool: 'suggestProducts',
            intent: intentToString(item.intent),
            outcome: result.outcome ?? (result.success ? 'SUCCESS' : 'FAIL'),
            productCount: sugCount,
            error: result.error,
          },
          'tool executed',
        );
      } catch (err) {
        log.error({ tool: 'suggestProducts', intent: intentToString(item.intent), err }, 'tool failed');
        result = { success: false, error: 'Tool execution failed' };
      }
      toolResultCache.set(toolKey, result);
    }

    toolResults.push({ intent: intentToString(item.intent), result });

    // Apply tool result to active flow.
    if (executionContext.activeFlow && result) {
      const updated = applyToolToFlow(executionContext.activeFlow, 'suggestProducts', result);
      if (updated && updated !== executionContext.activeFlow) {
        executionContext.activeFlow = updated;
        const idx = memory.flows.findIndex((f) => f.flowId === updated.flowId);
        if (idx >= 0) memory.flows[idx] = updated;
      }
    }

    // Store suggested products on message entities for backward compatibility.
    if (result.success && result.data?.products && Array.isArray(result.data.products)) {
      const productsArray = result.data.products as Array<{ id: string; name: string; price?: number }>;
      const productsList = productsArray.map((p) => ({ id: p.id, name: p.name }));

      await prisma.message.update({
        where: { id: messageId },
        data: {
          entities: {
            ...(entities as Record<string, unknown>),
            products: productsList,
          } as Prisma.InputJsonValue,
        },
      });

      log.info({ count: productsList.length }, 'stored suggested products in message entities');
    }
  }

  return { toolResults, memory };
}
