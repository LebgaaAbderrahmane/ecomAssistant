import prisma from '../../../config/db.config';
import type { ReadToolName, WriteToolName, ToolName } from '../schemas/intents.schemas';
import { convLogger } from '../../../lib/logger';
import { productTools } from './product.tools';
import { orderTools } from './order.tools';
import { shippingTools } from './shipping.tools';
import { getFlowOrderId, getFlowCurrentProductId, getFlowProductResults } from '../flow/flowExtractors';
import type {
  ToolExecutionContext,
  ToolResult,
  ToolHandler,
  ToolEntities,
} from './tool.types';

export type {
  ToolExecutionContext,
  ToolResult,
  ToolOutcome,
  ToolHandler,
  ToolEntities,
} from './tool.types';

export { getFlowOrderId, getFlowCurrentProductId, getFlowProductResults };

const escalateConversation: ToolHandler = async (_entities, ctx) => {
  const conversation = await prisma.conversation.findUnique({
    where: { id: ctx.conversationId },
  });
  if (!conversation) {
    return { success: false, error: 'Conversation not found' };
  }

  // Idempotent — one escalation per conversation.
  if (conversation.takenOverByHuman) {
    return { success: true, data: { escalated: false } };
  }

  await prisma.conversation.update({
    where: { id: ctx.conversationId },
    data: { takenOverByHuman: true, escalatedAt: new Date() },
  });

  const customer = await prisma.customer.findUnique({
    where: { id: ctx.customerId },
    select: { name: true, phone: true },
  });

  try {
    await prisma.notification.create({
      data: {
        merchantId: ctx.merchantId,
        type: 'escalation',
        title: 'Conversation escaladée',
        message: `Le client ${customer?.name || customer?.phone || 'inconnu'} a été transféré à un humain.`,
        link: '/dashboard/escalations',
      },
    });
  } catch (err) {
    convLogger({ conversationId: ctx.conversationId }).error({ err }, 'failed to create escalation notification');
  }

  return { success: true, data: { escalated: true } };
};

// Read tools have no business side-effects (orders/customer/takeover untouched;
// conversation navigation state/memory is fine). They are suppressed while a
// human owns the conversation.
export const readToolRegistry: Record<ReadToolName, ToolHandler> = {
  searchProducts: productTools.searchProducts,
  recallPreviousProducts: productTools.recallPreviousProducts,
  selectProduct: productTools.selectProduct,
  getProductDetails: productTools.getProductDetails,
  suggestProducts: productTools.suggestProducts,
  calculateShipping: shippingTools.calculateShipping,
  getOrderStatus: orderTools.getOrderStatus,
};

// Write tools mutate business data (order lifecycle, customer profile, takeover
// flag). They execute even while a human owns the conversation.
export const writeToolRegistry: Record<WriteToolName, ToolHandler> = {
  createOrder: orderTools.createOrder,
  confirmOrder: orderTools.confirmOrder,
  modifyOrder: orderTools.modifyOrder,
  cancelOrder: orderTools.cancelOrder,
  escalateConversation,
};

// Combined registry — the union of the two policy groups. `Record<ToolName,
// ToolHandler>` (plus a test) enforces that every tool lands in exactly one.
export const toolRegistry: Record<ToolName, ToolHandler> = {
  ...readToolRegistry,
  ...writeToolRegistry,
};

export const executeTool = async (
  toolName: ToolName,
  entities: ToolEntities,
  ctx: ToolExecutionContext
): Promise<ToolResult> => {
  try {
    return await toolRegistry[toolName](entities, ctx);
  } catch (err) {
    convLogger({ conversationId: ctx.conversationId }).error({ tool: toolName, err }, 'tool threw unexpected error');
    return { success: false, error: 'Tool execution failed unexpectedly' };
  }
};
