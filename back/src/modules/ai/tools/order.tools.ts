import type { Product } from '@prisma/client';
import prisma from '../../../config/db.config';
import {
  GetOrderStatusArgsSchema,
  ConfirmOrderArgsSchema,
  CancelOrderArgsSchema,
  CreateOrderArgsSchema,
  ModifyOrderArgsSchema,
} from '../schemas/intents.schemas';
import { migrateMemory, getActiveFlow } from '../flow/flowHelper';
import { getFlowOrderId, getFlowCurrentProductId } from '../flow/flowExtractors';
import { moduleLogger } from '../../../lib/logger';
import type { ToolHandler } from './tool.types';

const toolLogger = moduleLogger('toolLogger');

interface CommuneValidation {
  valid: boolean;
  commune?: string;
  wilaya?: string;
  suggestions?: string[];
}

async function validateCommune(name: string, wilaya?: string): Promise<CommuneValidation> {
  // Exact match (case-insensitive)
  const where: Record<string, unknown> = { name: { equals: name, mode: 'insensitive' } };
  if (wilaya) where.wilaya = { equals: wilaya, mode: 'insensitive' };

  const exact = await prisma.commune.findFirst({ where });
  if (exact) {
    return { valid: true, commune: exact.name, wilaya: exact.wilaya };
  }

  // Fuzzy match: ILIKE with wildcards
  const fuzzyWhere: Record<string, unknown> = { name: { contains: name, mode: 'insensitive' } };
  if (wilaya) fuzzyWhere.wilaya = { equals: wilaya, mode: 'insensitive' };

  const fuzzy = await prisma.commune.findMany({ where: fuzzyWhere, take: 3 });
  if (fuzzy.length > 0) {
    return {
      valid: false,
      suggestions: fuzzy.map((c) => wilaya ? `${c.name}` : `${c.name} (${c.wilaya})`),
    };
  }

  // Last resort: search all communes with similar name
  const allSimilar = await prisma.commune.findMany({
    where: { name: { contains: name, mode: 'insensitive' } },
    take: 3,
  });
  if (allSimilar.length > 0) {
    return {
      valid: false,
      suggestions: allSimilar.map((c) => `${c.name} (${c.wilaya})`),
    };
  }

  return { valid: false };
}

const getOrderStatus: ToolHandler = async (entities, ctx) => {
  const parsedArgs = GetOrderStatusArgsSchema.safeParse(entities);
  const orderId = getFlowOrderId(ctx.activeFlow) ?? (parsedArgs.success ? parsedArgs.data.orderId : undefined);

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

const confirmOrder: ToolHandler = async (entities, ctx) => {
  const parsedArgs = ConfirmOrderArgsSchema.safeParse(entities);

  // An order resolved implicitly from conversation context (the previous turn's
  // currentOrderId) is only confirmable while the assistant is actually waiting
  // for confirmation. A short acknowledgment like "okay" that the intent
  // extractor misread as ORDER_CONFIRM must never confirm a stale order from an
  // unrelated earlier exchange. An order the customer names explicitly in the
  // message is a fresh request and stays confirmable.
  const explicitlyReferenced =
    (parsedArgs.success && (parsedArgs.data.orderId || parsedArgs.data.productName)) ?? false;

  let orderId = getFlowOrderId(ctx.activeFlow);
  if (!orderId && parsedArgs.success && parsedArgs.data.orderId) {
    orderId = parsedArgs.data.orderId;
  }
  if (!orderId && parsedArgs.success && parsedArgs.data.productName) {
    const order = await prisma.order.findFirst({
      where: {
        merchantId: ctx.merchantId,
        customerId: ctx.customerId,
        productName: { equals: parsedArgs.data.productName, mode: 'insensitive' },
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (order) orderId = order.id;
  }

  if (!orderId) {
    return {
      success: false,
      error: 'No order in context to confirm',
    };
  }

  if (!explicitlyReferenced && orderId === getFlowOrderId(ctx.activeFlow)) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: ctx.conversationId },
      select: { state: true },
    });
    if (conversation?.state !== 'WAITING_CONFIRMATION') {
      return {
        success: false,
        outcome: 'AMBIGUOUS',
        error: 'No order is waiting for confirmation right now. If you want to place a new order, tell me the product and delivery details.',
      };
    }
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
        productName: order.productName,
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

  let orderId = getFlowOrderId(ctx.activeFlow);
  if (!orderId && parsedArgs.success && parsedArgs.data.orderId) {
    orderId = parsedArgs.data.orderId;
  }
  if (!orderId && parsedArgs.success && parsedArgs.data.productName) {
    const order = await prisma.order.findFirst({
      where: {
        merchantId: ctx.merchantId,
        customerId: ctx.customerId,
        productName: { equals: parsedArgs.data.productName, mode: 'insensitive' },
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (order) orderId = order.id;
  }

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
        productName: order.productName,
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

const createOrder: ToolHandler = async (entities, ctx) => {
  const logger = toolLogger.child({
    tool: 'createOrder',
    conversationId: ctx.conversationId,
    merchantId: ctx.merchantId,
    customerId: ctx.customerId,
  });

  logger.info('createOrder: started');

  // --------------------------------------------------
  // Validate arguments
  // --------------------------------------------------

  const parsedArgs = CreateOrderArgsSchema.safeParse(entities);

  if (!parsedArgs.success) {
    const missing = parsedArgs.error.issues
      .map(i => i.path.join('.'))
      .join(', ');

    logger.warn(
      { issues: parsedArgs.error.issues, missing },
      'createOrder: argument validation failed',
    );

    return {
      success: false,
      error: `Missing required fields: ${missing}`,
    };
  }

  const {
    productId,
    product: productName,
    quantity: quantityArg,
  } = parsedArgs.data;

  logger.info(
    {
      productId,
      productName,
      quantity: quantityArg,
    },
    'createOrder: arguments validated',
  );

  // --------------------------------------------------
  // Load conversation memory (for delivery + quantity reuse)
  // --------------------------------------------------
  // Read the customer's saved delivery info (commune, wilaya) and any pending
  // order data from conversation memory so a follow-up message never loses
  // fields (e.g. quantity) the customer already provided.
  const conv = await prisma.conversation.findUnique({
    where: { id: ctx.conversationId },
    select: { memory: true },
  });
  const memory = migrateMemory(conv?.memory);
  const memoryActiveFlow = getActiveFlow(memory) ?? null;

  const memoryWilaya = memory.globalInformation.wilaya;
  const memoryCommune = memory.globalInformation.commune;
  const orderActiveFlow = ctx.activeFlow && 'order' in ctx.activeFlow
    ? ctx.activeFlow
    : memoryActiveFlow && 'order' in memoryActiveFlow
      ? memoryActiveFlow
      : null;
  const memoryQuantity = orderActiveFlow?.order.quantity;

  // --------------------------------------------------
  // Resolve delivery information
  // --------------------------------------------------

  const wilaya =
    parsedArgs.data.wilaya ??
    memoryWilaya ??
    ctx.customerWilaya ??
    undefined;

  const communeInput =
    parsedArgs.data.commune ??
    memoryCommune;

  const quantity =
    quantityArg ??
    memoryQuantity ??
    1;

  logger.info(
    {
      wilaya,
      commune: communeInput,
      quantity,
      wilayaSource: parsedArgs.data.wilaya
        ? 'input'
        : memoryWilaya
          ? 'memory'
          : ctx.customerWilaya
            ? 'customer'
            : 'missing',
      communeSource: parsedArgs.data.commune
        ? 'input'
        : memoryCommune
          ? 'memory'
          : 'missing',
      quantitySource: quantityArg
        ? 'input'
        : memoryQuantity
          ? 'memory'
          : 'default',
    },
    'createOrder: delivery information resolved',
  );

  // --------------------------------------------------
  // Resolve product
  // --------------------------------------------------

  let product: Product | null = null;

  if (productId) {
    logger.info(
      { productId },
      'createOrder: searching product by productId',
    );

    product = await prisma.product.findFirst({
      where: {
        id: productId,
        merchantId: ctx.merchantId,
      },
    });

    if (product) {
      logger.info(
        {
          productId: product.id,
          productName: product.name,
        },
        'createOrder: product found by productId',
      );
    } else {
      logger.warn(
        { productId },
        'createOrder: product not found by productId',
      );
    }
  }

  if (!product && productName) {
    logger.info(
      { productName },
      'createOrder: searching product by name',
    );

    product = await prisma.product.findFirst({
      where: {
        merchantId: ctx.merchantId,
        name: {
          contains: productName,
          mode: 'insensitive',
        },
      },
    });

    if (product) {
      logger.info(
        {
          productId: product.id,
          productName: product.name,
        },
        'createOrder: product found by name',
      );
    } else {
      logger.warn(
        { productName },
        'createOrder: product not found by name',
      );
    }
  }

  const currentProductId =
    getFlowCurrentProductId(ctx.activeFlow);

  if (!product && currentProductId) {
    logger.info(
      { currentProductId },
      'createOrder: searching product from active flow',
    );

    product = await prisma.product.findFirst({
      where: {
        id: currentProductId,
        merchantId: ctx.merchantId,
      },
    });

    if (product) {
      logger.info(
        {
          productId: product.id,
          productName: product.name,
        },
        'createOrder: product found from active flow',
      );
    } else {
      logger.warn(
        { currentProductId },
        'createOrder: active flow product not found',
      );
    }
  }

  if (!product) {
    logger.warn(
      {
        productId,
        productName,
        currentProductId,
      },
      'createOrder: product could not be resolved',
    );

    return {
      success: false,
      error: 'Product not found. Choose a product first.',
    };
  }

  // --------------------------------------------------
  // Validate delivery information
  // --------------------------------------------------

  const partialOrderData = {
    productId: product.id,
    ...(quantity !== undefined && { quantity }),
  };

  if (!wilaya) {
    logger.warn(
      'createOrder: missing wilaya',
    );

    return {
      success: false,
      error: 'Missing required field: wilaya',
      data: { ...partialOrderData },
    };
  }

  if (!communeInput) {
    logger.warn(
      'createOrder: missing commune',
    );

    return {
      success: false,
      error: 'Missing required field: commune',
      data: { ...partialOrderData },
    };
  }

  logger.info(
    {
      wilaya,
      commune: communeInput,
    },
    'createOrder: validating commune',
  );

  // const communeCheck = await validateCommune(
  //   communeInput,
  //   wilaya,
  // );

  // if (!communeCheck.valid) {
  //   logger.warn(
  //     {
  //       wilaya,
  //       commune: communeInput,
  //       suggestions: communeCheck.suggestions,
  //     },
  //     'createOrder: commune validation failed',
  //   );

  //   if (communeCheck.suggestions?.length) {
  //     const list = communeCheck.suggestions.join(', ');

  //     logger.info(
  //       {
  //         suggestions: communeCheck.suggestions,
  //       },
  //       'createOrder: returning commune suggestions',
  //     );

  //     return {
  //       success: false,
  //       error: `Baladia "${communeInput}" makanach. Chno khatrek? ${list}`,
  //       data: { ...partialOrderData },
  //     };
  //   }

  //   return {
  //     success: false,
  //     error: `Baladia "${communeInput}" makanach f l'wilaya dyal ${wilaya}.`,
  //     data: { ...partialOrderData },
  //   };
  // }

  const commune = communeInput;

  logger.info(
    {
      wilaya,
      commune,
    },
    'createOrder: commune validated',
  );

  // --------------------------------------------------
  // Stock validation
  // --------------------------------------------------

  if (product.stockStatus === 'out_of_stock') {
    logger.warn(
      {
        productId: product.id,
        productName: product.name,
      },
      'createOrder: product is out of stock',
    );

    return {
      success: false,
      error: `Product "${product.name}" is out of stock`,
    };
  }

  logger.info(
    {
      productId: product.id,
      productName: product.name,
      quantity,
      price: product.price,
    },
    'createOrder: product validated',
  );

  // --------------------------------------------------
  // Delivery cost
  // --------------------------------------------------

  logger.info(
    { wilaya },
    'createOrder: searching delivery cost',
  );

  const deliveryCostRow =
    await prisma.wilayaDeliveryCost.findFirst({
      where: {
        merchantId: ctx.merchantId,
        wilaya: {
          equals: wilaya,
          mode: 'insensitive',
        },
      },
    });

  if (!deliveryCostRow) {
    logger.warn(
      { wilaya },
      'createOrder: no delivery cost configured, defaulting to 0',
    );
  } else {
    logger.info(
      {
        wilaya,
        deliveryCost: deliveryCostRow.cost,
      },
      'createOrder: delivery cost found',
    );
  }

  const deliveryCostValue =
    deliveryCostRow?.cost ?? 0;

  const totalAmount =
    product.price * quantity + deliveryCostValue;

  logger.info(
    {
      productId: product.id,
      quantity,
      productPrice: product.price,
      deliveryCost: deliveryCostValue,
      totalAmount,
    },
    'createOrder: total calculated',
  );

  // --------------------------------------------------
  // Create order
  // --------------------------------------------------

  const platformOrderId = `FAKE-${Date.now()}`;

  logger.info(
    {
      productId: product.id,
      quantity,
      wilaya,
      commune,
      totalAmount,
    },
    'createOrder: creating order',
  );

  const order = await prisma.order.create({
    data: {
      merchantId: ctx.merchantId,
      customerId: ctx.customerId,
      platformOrderId,
      wilaya,
      commune,
      productId: product.id,
      productName: product.name,
      quantity,
      totalAmount,
      deliveryCost: deliveryCostValue,
      // The customer created the order in-conversation and already provided all
      // order details, so it is created confirmed and never needs the external
      // confirmation-template flow.
      status: 'CONFIRMED',
      orderSource: 'CONVERSATION',
    },
  });

  logger.info(
    {
      orderId: order.id,
      productId: product.id,
      totalAmount,
    },
    'createOrder: order created',
  );

  // --------------------------------------------------
  // Save customer delivery information
  // --------------------------------------------------

  logger.info(
    {
      customerId: ctx.customerId,
      wilaya,
      commune,
    },
    'createOrder: updating customer delivery information',
  );

  await prisma.customer.update({
    where: { id: ctx.customerId },
    data: { wilaya, commune },
  });

  logger.info(
    { customerId: ctx.customerId },
    'createOrder: customer delivery information updated',
  );

  // --------------------------------------------------
  // Update conversation
  // --------------------------------------------------
  // The order was confirmed in-conversation: don't set WAITING_CONFIRMATION and
  // don't enqueue the confirmation template job. The in-conversation reply the
  // LLM generates is the confirmation acknowledgment.

  await prisma.conversation.update({
    where: { id: ctx.conversationId },
    data: {
      currentOrderId: order.id,
      state: 'CONFIRMED',
    },
  });

  logger.info(
    {
      orderId: order.id,
      state: 'CONFIRMED',
      orderSource: 'CONVERSATION',
    },
    'createOrder: conversation updated (auto-confirmed)',
  );

  // --------------------------------------------------
  // Success
  // --------------------------------------------------

  logger.info(
    {
      orderId: order.id,
      productId: product.id,
      quantity,
      totalAmount,
      wilaya,
      commune,
    },
    'createOrder: completed successfully',
  );

  return {
    success: true,
    data: {
      orderId: order.id,
      productName: product.name,
      quantity,
      price: product.price,
      totalAmount,
      deliveryCost: deliveryCostValue,
      wilaya,
      commune,
    },
  };
};

const modifyOrder: ToolHandler = async (entities, ctx) => {
  const parsedArgs = ModifyOrderArgsSchema.safeParse(entities);
  if (!parsedArgs.success) {
    return { success: false, error: 'No fields provided to modify' };
  }

  if (!getFlowOrderId(ctx.activeFlow)) {
    return { success: false, error: 'No pending order in context to update' };
  }

  const order = await prisma.order.findFirst({
    where: {
      id: getFlowOrderId(ctx.activeFlow)!,
      merchantId: ctx.merchantId,
      customerId: ctx.customerId,
      status: 'PENDING',
    },
  });

  if (!order) {
    return { success: false, error: 'No pending order found to update' };
  }

  // Resolve the product to get current price for total recalculation
  const product = await prisma.product.findFirst({
    where: { id: order.productId, merchantId: ctx.merchantId },
  });
  if (!product) {
    return { success: false, error: 'Product for this order no longer exists' };
  }

  const updateData: Record<string, string | number> = {};

  // Handle quantity change
  const newQuantity = parsedArgs.data.quantity ?? order.quantity;
  if (parsedArgs.data.quantity !== undefined) {
    updateData.quantity = newQuantity;
  }

  // Handle wilaya change
  if (parsedArgs.data.wilaya) {
    updateData.wilaya = parsedArgs.data.wilaya;
  }

  // Validate commune if provided
  if (parsedArgs.data.commune) {
    const communeCheck = await validateCommune(parsedArgs.data.commune, parsedArgs.data.wilaya ?? order.wilaya);
    if (!communeCheck.valid) {
      if (communeCheck.suggestions?.length) {
        const list = communeCheck.suggestions.join(', ');
        return {
          success: false,
          error: `Baladia "${parsedArgs.data.commune}" makanach. Chno khatrek? ${list}`,
        };
      }
      return {
        success: false,
        error: `Baladia "${parsedArgs.data.commune}" makanach f l'wilaya dyal ${parsedArgs.data.wilaya ?? order.wilaya}.`,
      };
    }
    updateData.commune = communeCheck.commune!;
  }

  // Recalculate delivery cost if wilaya changed
  let deliveryCostValue = order.deliveryCost;
  if (parsedArgs.data.wilaya) {
    const deliveryCostRow = await prisma.wilayaDeliveryCost.findFirst({
      where: { merchantId: ctx.merchantId, wilaya: { equals: parsedArgs.data.wilaya, mode: 'insensitive' } },
    });
    deliveryCostValue = deliveryCostRow?.cost ?? 0;
    updateData.deliveryCost = deliveryCostValue;
  }

  // Recalculate total: price * quantity + delivery cost
  const newTotal = product.price * newQuantity + deliveryCostValue;

  const updatedOrder = await prisma.order.update({
    where: { id: order.id },
    data: {
      ...updateData,
      totalAmount: newTotal,
    },
  });

  // Update customer record for future orders
  const customerUpdate: Record<string, string | null> = {};
  if (parsedArgs.data.wilaya) customerUpdate.wilaya = parsedArgs.data.wilaya;
  if (parsedArgs.data.commune) customerUpdate.commune = parsedArgs.data.commune;
  if (Object.keys(customerUpdate).length > 0) {
    await prisma.customer.update({
      where: { id: ctx.customerId },
      data: customerUpdate,
    });
  }

  return {
    success: true,
    data: {
      orderId: updatedOrder.id,
      productName: updatedOrder.productName,
      quantity: updatedOrder.quantity,
      wilaya: updatedOrder.wilaya,
      commune: updatedOrder.commune,
      deliveryCost: deliveryCostValue,
      totalAmount: newTotal,
    },
  };
};

export const orderTools = {
  getOrderStatus,
  confirmOrder,
  cancelOrder,
  createOrder,
  modifyOrder,
};
