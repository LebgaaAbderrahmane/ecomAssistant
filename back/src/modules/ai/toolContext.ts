import type { Prisma } from '@prisma/client';
import prisma from '../../config/db.config';
import type { ConversationMemory } from './memory.types';
import type { ReadToolName, ToolName } from './schemas/intents.schemas';
import { READ_TOOL_TRANSITIONS } from './conversationState';
import type { ToolResult } from './tools/registry';
import { memoryExclusionIds } from './tools/suggestionHelpers';

// The transport (gRPC ToolService) MATERIALIZES the previously-implicit values
// into explicit entities before each call:
//   orderId   ← conversation.currentOrderId   (confirmOrder / cancelOrder /
//                                              modifyOrder / getOrderStatus,
//                                              only when the caller omits it)
//   productId ← conversation.currentProductId (getProductDetails, and
//                                              selectProduct only when the
//                                              caller gave neither id nor name)
export type InjectedToolEntities = Record<string, string | number | boolean | null>;

export interface ToolSourceContext {
  conversation: {
    id: string;
    merchantId: string;
    customerId: string;
    currentOrderId: string | null;
    currentProductId: string | null;
    state: string;
  };
  customer: { wilaya: string | null; commune: string | null };
  memory: ConversationMemory;
}

// Construct the explicit entities a tool consumes: LLM-derived entities +
// injected identity + materialized context (current order/product).
// `orderId`/`productId` are the native keys the tools read — no
// `currentOrderId`/`currentProductId`/`conversationState` context keys are
// passed.
//
// Product tools are explicit-query only under M6/M7: searchProducts is a pure
// catalog search, selectProduct/getProductDetails take the injected current
// product id or the customer's explicit name, createOrder requires an explicit
// productId, and suggestProducts receives the memory-derived exclusions as
// `excludedProductIds` instead of reading memory.
export function buildToolEntities(
  toolName: ToolName,
  entities: InjectedToolEntities,
  source: ToolSourceContext,
  opts: { lastProductResults?: ConversationMemory['lastProductResults'] } = {},
): InjectedToolEntities {
  const { conversation } = source;
  const toolEntities: InjectedToolEntities = {
    ...entities,
    merchantId: conversation.merchantId,
    customerId: conversation.customerId,
    conversationId: conversation.id,
  };

  switch (toolName) {
    case 'cancelOrder':
    case 'getOrderStatus':
    case 'modifyOrder':
    case 'confirmOrder':
      if (!toolEntities.orderId && conversation.currentOrderId) {
        toolEntities.orderId = conversation.currentOrderId;
      }
      break;

    case 'suggestProducts':
      // The tool never reads memory: the transport computes the discarded
      // products (already offered this exchange + explicitly rejected +
      // currently selected) and passes them as excludedProductIds.
      {
        const excludeIds = memoryExclusionIds(
          { ...source.memory, lastProductResults: opts.lastProductResults ?? source.memory.lastProductResults ?? [] },
          conversation.currentProductId,
        );
        if (excludeIds.length) {
          toolEntities.excludedProductIds = JSON.stringify(excludeIds);
        }
      }
      break;

    case 'selectProduct':
      // Materialize the tracked current product ONLY when the customer gave
      // neither an explicit product id nor a product name — an explicit choice
      // always wins over the "select the one we were discussing" fallback.
      if (!toolEntities.productId && !toolEntities.productName && conversation.currentProductId) {
        toolEntities.productId = conversation.currentProductId;
      }
      break;

    case 'getProductDetails':
      if (!toolEntities.productId && conversation.currentProductId) {
        toolEntities.productId = conversation.currentProductId;
      }
      break;

    default:
      break;
  }

  return toolEntities;
}

// READ tools are pure: the transport owns their conversation navigation. After
// a successful READ-tool run the transport applies the tool's transition
// (search/suggest -> PRODUCT_DISCOVERY; selectProduct/getProductDetails
// -> PRODUCT_SELECTED + currentProductId from the result) — handlers never
// touch the conversation row.
export async function applyReadToolState(
  conversationId: string,
  toolName: ToolName,
  result: ToolResult,
): Promise<void> {
  if (!result.success) return;
  const transition = READ_TOOL_TRANSITIONS[toolName as ReadToolName];
  if (!transition) return;
  const data: Prisma.ConversationUpdateInput = { state: transition };
  const productId = result.data?.productId;
  if (typeof productId === 'string') {
    data.currentProductId = productId;
  }
  await prisma.conversation.update({ where: { id: conversationId }, data });
}