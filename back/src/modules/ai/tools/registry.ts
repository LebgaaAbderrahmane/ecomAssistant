import type { Product, ToolName } from '@prisma/client';
import prisma from '../../../config/db.config';
import {
  SearchProductsArgsSchema,
  GetOrderStatusArgsSchema,
  CalculateShippingArgsSchema,
  ConfirmOrderArgsSchema,
  CancelOrderArgsSchema,
  RecallPreviousProductsArgsSchema
} from '../schemas/intents.schemas';

export interface ToolExecutionContext {
  merchantId: string;
  customerId: string;
  conversationId: string;
  currentOrderId: string | null;
}

export interface ToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

type ToolEntities = Record<string, string | number | boolean | null>;
type ToolHandler = (entities: ToolEntities, ctx: ToolExecutionContext) => Promise<ToolResult>;

const notImplemented: ToolHandler = async () => ({
  success: false,
  error: 'This tool is not implemented yet',
});

const searchProducts: ToolHandler = async (entities, ctx) => {
  const parsedArgs = SearchProductsArgsSchema.safeParse(entities);
  if (!parsedArgs.success) {
    return { success: false, error: 'No product name provided to search for' };
  }

  const products = await prisma.product.findMany({
    where: {
      merchantId: ctx.merchantId,
      name: { contains: parsedArgs.data.product, mode: 'insensitive' },
    },
    take: 5,
  });

  if (products.length === 0) {
    return { success: false, error: `No products found matching "${parsedArgs.data.product}"` };
  }

  return {
    success: true,
    data: {
      products: products.map((p: Product) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        currency: p.currency,
        stockStatus: p.stockStatus,
      })),
    },
  };
};

const getOrderStatus: ToolHandler = async (entities, ctx) => {
  const parsedArgs = GetOrderStatusArgsSchema.safeParse(entities);
  const orderId = ctx.currentOrderId ?? (parsedArgs.success ? parsedArgs.data.orderId : undefined);

  if (!orderId) {
    return { success: false, error: 'No order in context to check status for' };
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, merchantId: ctx.merchantId, customerId: ctx.customerId },
  });

  if (!order) {
    return { success: false, error: 'Order not found' };
  }

  return {
    success: true,
    data: { orderId: order.id, status: order.status, trackingNumber: order.trackingNumber },
  };
};

const calculateShipping: ToolHandler = async (entities, ctx) => {
  const parsedArgs = CalculateShippingArgsSchema.safeParse(entities);
  if (!parsedArgs.success) {
    return { success: false, error: 'No wilaya provided to calculate shipping for' };
  }

  const cost = await prisma.wilayaDeliveryCost.findFirst({
    where: { merchantId: ctx.merchantId, wilaya: { equals: parsedArgs.data.wilaya, mode: 'insensitive' } },
  });

  if (!cost) {
    return { success: false, error: `No delivery cost configured for "${parsedArgs.data.wilaya}"` };
  }

  return { success: true, data: { wilaya: cost.wilaya, cost: cost.cost } };
};

const confirmOrder: ToolHandler = async (entities, ctx) => {
  const parsedArgs = ConfirmOrderArgsSchema.safeParse(entities);

  const orderId =
    ctx.currentOrderId ??
    (parsedArgs.success ? parsedArgs.data.orderId : undefined);

  if (!orderId) {
    return {
      success: false,
      error: 'No order in context to confirm',
    };
  }

  try {
    const order = await prisma.order.update({
      where: {
        id: orderId,
        merchantId: ctx.merchantId,
        customerId: ctx.customerId,
      },
      data: {
        status: 'CONFIRMED',
      },
    });

    return {
      success: true,
      data: {
        orderId: order.id,
        status: order.status,
      },
    };
  } catch (err: any) {
    if (err?.code === 'P2025') {
      return {
        success: false,
        error: 'Order not found',
      };
    }

    throw err;
  }
};

const cancelOrder: ToolHandler = async (entities, ctx) => {
  const parsedArgs = CancelOrderArgsSchema.safeParse(entities);

  const orderId =
    ctx.currentOrderId ??
    (parsedArgs.success ? parsedArgs.data.orderId : undefined);

  if (!orderId) {
    return {
      success: false,
      error: 'No order in context to cancel',
    };
  }

  try {
    const existing = await prisma.order.findFirst({
      where: {
        id: orderId,
        merchantId: ctx.merchantId,
        customerId: ctx.customerId,
      },
    });

    if (!existing) {
      return { success: false, error: 'Order not found' };
    }

    if (existing.status === 'CANCELLED') {
      return { success: false, error: 'Order is already cancelled' };
    }


    // claude doesn't know that algerians cancel even after shipping 😂, so we will not block it for now
    // if (existing.status === 'SHIPPED' || existing.status === 'DELIVERED') {
    //   return {
    //     success: false,
    //     error: `Order cannot be cancelled because it is already ${existing.status.toLowerCase()}`,
    //   };
    // }

    const order = await prisma.order.update({
      where: {
        id: orderId,
        merchantId: ctx.merchantId,
        customerId: ctx.customerId,
      },
      data: {
        status: 'CANCELLED',
      },
    });

    return {
      success: true,
      data: {
        orderId: order.id,
        status: order.status,
      },
    };
  } catch (err: any) {
    if (err?.code === 'P2025') {
      return {
        success: false,
        error: 'Order not found',
      };
    }

    throw err;
  }
};
const recallPreviousProducts: ToolHandler = async (entities, ctx) => {
  const parsedArgs = RecallPreviousProductsArgsSchema.safeParse(entities);
  const limit = parsedArgs.success && parsedArgs.data.limit ? parsedArgs.data.limit : 5;

  const messages = await prisma.message.findMany({
    where: {
      conversationId: ctx.conversationId,
      intent: { in: ['SEARCH_PRODUCT', 'getProductDetails'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 30, // scan a window, not the whole history
  });

  console.log(`[recallPreviousProducts] found ${messages.length} messages in conversation ${ctx.conversationId}`);

  // Extract product names from entities (e.g. {"product":"iphone 15"}), most-recent-first, deduped
  const seen = new Set<string>();
  const productNames: string[] = [];

  for (const msg of messages) {
    let ents: Record<string, unknown> | null = null;
    console.log(`[recallPreviousProducts] parsing entities string: ${msg.entities}`);
    if (typeof msg.entities === 'string') {
      try { ents = JSON.parse(msg.entities); } catch { /* skip */ }
      console.log(`[recallPreviousProducts] parsing entities string: ${ents}`);
    } else if (msg.entities && typeof msg.entities === 'object') {
      ents = msg.entities as Record<string, unknown>;
      console.log(`[recallPreviousProducts] parsing entities string: ${ents}`);
    }
    const name = ents?.product;
    console.log('[recallPreviousProducts] extracted product name:', name);
    if (typeof name === 'string' && !seen.has(name)) {
      seen.add(name);
      productNames.push(name);
    }
    if (productNames.length >= limit) break;
    console.log(`[recallPreviousProducts] collected ${productNames.length} product names so far:`, productNames);
  }

  if (productNames.length === 0) {
    return { success: false, error: 'No previous products found in this conversation' };
  }

  const products = await prisma.product.findMany({
    where: { name: { in: productNames, mode: 'insensitive' }, merchantId: ctx.merchantId },
  });

  // preserve recency order
  const ordered = productNames
    .map((name) => products.find((p: Product) => p.name.toLowerCase() === name.toLowerCase()))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return {
    success: true,
    data: {
      products: productNames
    },
  };
};

export const toolRegistry: Record<ToolName, ToolHandler> = {
  searchProducts,
  getProductDetails: notImplemented,
  createOrder: notImplemented,
  confirmOrder,
  cancelOrder,
  getOrderStatus,
  calculateShipping,
  recallPreviousProducts,
  updateAddress: notImplemented,
  createSupportTicket: notImplemented,
};

export const executeTool = async (
  toolName: ToolName,
  entities: ToolEntities,
  ctx: ToolExecutionContext
): Promise<ToolResult> => {
  try {
    return await toolRegistry[toolName](entities, ctx);
  } catch (err) {
    console.error(`[tools] "${toolName}" threw an unexpected error`, err);
    return { success: false, error: 'Tool execution failed unexpectedly' };
  }
};