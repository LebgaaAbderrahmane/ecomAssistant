import type { Prisma } from '@prisma/client';
import prisma from '../../../config/db.config';
import { msgLogger } from '../../../lib/logger';
import type { ToolExecutionContext, ToolResult } from '../tools/registry';
import { executeTool } from '../tools/registry';
import { applyToolResult } from '../flow/flowProcessor';
import { getFlowCurrentProductId, getFlowProductResults } from '../flow/flowExtractors';
import { resolveTool } from '../schemas/intents.schemas';
import type { IntentField } from '../schemas/intents.schemas';
import type { Flow } from '../memory.types';

export async function resolveProductId(merchantId: string, productName: string): Promise<string | null> {
  const product = await prisma.product.findFirst({
    where: {
      merchantId,
      name: { contains: productName, mode: 'insensitive' },
    },
  });
  return product?.id ?? null;
}

// ---------------------------------------------------------------------------
// Flow update helper
//
// After every tool execution, applies the result to the active flow via
// FlowProcessor.applyToolResult. Handles the data-shape normalization between
// what tools return ({ id, name, price }) and what FlowProduct expects
// ({ productId, productName, price, variants }).
// ---------------------------------------------------------------------------

export function normalizeProductsForFlow(
  rawProducts: Array<{ id: string; name: string; price?: number }>,
): Array<{ productId: string; productName: string; price: number; variants: never[] }> {
  return rawProducts.map((p) => ({
    productId: p.id,
    productName: p.name,
    price: p.price ?? 0,
    variants: [] as never[],
  }));
}

/**
 * Applies a tool result to the active flow. If no active flow or tool result
 * is null, this is a no-op. Returns the (possibly new) flow reference so
 * callers can update memory/executionContext.
 */
export function applyToolToFlow(
  flow: Flow | null,
  toolName: string,
  result: ToolResult | null,
): Flow | null {
  if (!flow || !result) return flow;

  // Build the data object that applyToolResult expects, normalizing shapes
  // where tool output differs from FlowProduct / OrderData schemas.
  let flowData: Record<string, unknown> | undefined;
  if (result.data) {
    flowData = { ...result.data };

    // Normalize product arrays: tools return { id, name, price }, FlowProduct
    // expects { productId, productName, price, variants }.
    if (flowData.products && Array.isArray(flowData.products)) {
      flowData.products = normalizeProductsForFlow(
        flowData.products as Array<{ id: string; name: string; price?: number }>,
      );
    }
  }

  return applyToolResult(flow, toolName as import('../schemas/intents.schemas').ToolName, result.success, flowData);
}

export type EntityMap = Record<string, string | number | boolean | null>;

/**
 * Product context resolution. When currentProductId is not set, the system
 * automatically resolves it:
 *  1. If search results exist and entities contain selection info → auto-select
 *  2. If no search results → redirect to searchProducts
 * Returns the (possibly updated) intent/entities and — because case 1/2 may
 * run a tool that transitions the flow — the possibly updated executionContext.
 */
export async function resolveProductContext(
  intent: IntentField,
  entities: EntityMap,
  executionContext: ToolExecutionContext,
  log: ReturnType<typeof msgLogger>,
): Promise<{
  intent: IntentField;
  entities: EntityMap;
  executionContext: ToolExecutionContext;
}> {
  const toolName = resolveTool(intent, entities);
  if (toolName !== 'getProductDetails') {
    return { intent, entities, executionContext };
  }

  const currentProductId = getFlowCurrentProductId(executionContext.activeFlow);
  if (currentProductId) {
    return { intent, entities, executionContext };
  }

  const results = getFlowProductResults(executionContext.activeFlow);
  const hasProductIndex = entities.productIndex !== undefined && typeof entities.productIndex === 'number';
  const productName = entities.productName ?? entities.product;
  const hasProductName = typeof productName === 'string' && productName.length > 0;

  // Case 1: Search results exist and customer is selecting from them
  if (results?.length && (hasProductIndex || hasProductName)) {
    log.info({ productIndex: entities.productIndex, productName }, 'auto-selecting product before details');
    const selectResult = await executeTool('selectProduct', entities, executionContext);
    if (selectResult.success) {
      executionContext.activeFlow = applyToolToFlow(executionContext.activeFlow, 'selectProduct', selectResult);
    }
    return { intent, entities, executionContext };
  }

  // Case 2: No search results — execute search first, then let original tool run
  if (hasProductName) {
    log.info({ productName }, 'no search results, executing search before details');
    const searchResult = await executeTool('searchProducts', { product: productName }, executionContext);
    if (searchResult.success) {
      executionContext.activeFlow = applyToolToFlow(executionContext.activeFlow, 'searchProducts', searchResult);
    }
    // Return original intent — getProductDetails will run next and use
    // currentProductId if the search auto-selected (single result), or
    // return AMBIGUOUS if multiple results were found.
    return { intent, entities, executionContext };
  }

  // Case 3: Can't resolve — fall through to tool which returns AMBIGUOUS
  return { intent, entities, executionContext };
}

export type JsonEntityMap = Prisma.JsonValue;
