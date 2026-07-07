import type { ToolName } from '../schemas/intents.schemas';
import { Prisma } from '@prisma/client';
import prisma from '../../../config/db.config';
import {
  SearchProductsArgsSchema,
  GetOrderStatusArgsSchema,
  CalculateShippingArgsSchema,
  ConfirmOrderArgsSchema,
  CancelOrderArgsSchema
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
      products: products.map((p) => ({
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
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
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
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      return {
        success: false,
        error: 'Order not found',
      };
    }

    throw err;
  }
};

export const toolRegistry: Record<ToolName, ToolHandler> = {
  searchProducts,
  getProductDetails: notImplemented,
  createOrder: notImplemented,
  confirmOrder,
  cancelOrder,
  getOrderStatus,
  calculateShipping,
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