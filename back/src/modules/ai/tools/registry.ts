import type { Product } from '@prisma/client';
import type { ToolName } from '../schemas/intents.schemas';
import prisma from '../../../config/db.config';
import {
  SearchProductsArgsSchema,
  GetOrderStatusArgsSchema,
  CalculateShippingArgsSchema,
  ConfirmOrderArgsSchema,
  CancelOrderArgsSchema,
  RecallPreviousProductsArgsSchema,
  CreateOrderArgsSchema,
  ChooseProductArgsSchema,
  GetProductDetailsArgsSchema,
  ModifyOrderArgsSchema,
} from '../schemas/intents.schemas';
import { enqueueOrderJob } from '../../../queues/order.queue';
import { buildProductCatalog, matchProductsWithLLM, fetchProductsByIds } from './searchHelpers';

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

export interface ToolExecutionContext {
  merchantId: string;
  customerId: string;
  conversationId: string;
  currentOrderId: string | null;
  currentProductId: string | null;
  lastProductResults?: Array<{ id: string; name: string }>;
  customerWilaya?: string | null;
  customerCommune?: string | null;
}

export interface ToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

type ToolEntities = Record<string, string | number | boolean | null>;
type ToolHandler = (entities: ToolEntities, ctx: ToolExecutionContext) => Promise<ToolResult>;

function formatProducts(products: Product[]) {
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    currency: p.currency,
    stockStatus: p.stockStatus,
  }));
}

const searchProducts: ToolHandler = async (entities, ctx) => {
  const parsedArgs = SearchProductsArgsSchema.safeParse(entities);
  if (!parsedArgs.success) {
    return { success: false, error: 'No product name provided to search for' };
  }
  const query = parsedArgs.data.product;

  // Step 1: Fast case-insensitive SQL search on product name
  const fastResults = await prisma.product.findMany({
    where: {
      merchantId: ctx.merchantId,
      name: { contains: query, mode: 'insensitive' },
    },
    take: 5,
  });

  if (fastResults.length > 0) {
    return { success: true, data: { products: formatProducts(fastResults) } };
  }

  // Step 2: LLM fallback — build catalog and let the model match
  const catalog = await buildProductCatalog(ctx.merchantId);
  if (catalog.length === 0) {
    return { success: false, error: 'No products found in store catalog' };
  }

  const matchedIds = await matchProductsWithLLM(catalog, query);
  if (matchedIds.length === 0) {
    return { success: false, error: `No products found matching "${query}"` };
  }

  const products = await fetchProductsByIds(ctx.merchantId, matchedIds);
  if (products.length === 0) {
    return { success: false, error: `No products found matching "${query}"` };
  }

  return { success: true, data: { products: formatProducts(products.slice(0, 5)) } };
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

  let orderId = ctx.currentOrderId;
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

  let orderId = ctx.currentOrderId;
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
const recallPreviousProducts: ToolHandler = async (entities, ctx) => {
  const parsedArgs = RecallPreviousProductsArgsSchema.safeParse(entities);
  const limit = parsedArgs.success && parsedArgs.data.limit ? parsedArgs.data.limit : 5;

  const messages = await prisma.message.findMany({
    where: {
      conversationId: ctx.conversationId,
      intent: { in: ['PRODUCT_SEARCH', 'PRODUCT_DETAILS'] },
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
      products: formatProducts(ordered),
    },
  };
};

const chooseProduct: ToolHandler = async (entities, ctx) => {
  const parsedArgs = ChooseProductArgsSchema.safeParse(entities);
  if (!parsedArgs.success) {
    return { success: false, error: 'No product name or index provided to choose' };
  }

  let product: Product | null = null;

  // Resolve by index from lastProductResults if productIndex is provided
  if (parsedArgs.data.productIndex !== undefined) {
    const lastResults = ctx.lastProductResults ?? [];
    const entry = lastResults[parsedArgs.data.productIndex];
    if (!entry) {
      return {
        success: false,
        error: `No product at index ${parsedArgs.data.productIndex} (last search had ${lastResults.length} results)`,
      };
    }
    product = await prisma.product.findFirst({
      where: { id: entry.id, merchantId: ctx.merchantId },
    });
  }

  // Fall back to name-based lookup
  if (!product && parsedArgs.data.productName) {
    product = await prisma.product.findFirst({
      where: {
        merchantId: ctx.merchantId,
        name: { contains: parsedArgs.data.productName, mode: 'insensitive' },
      },
    });
  }

  if (!product) {
    return { success: false, error: 'Product not found' };
  }

  await prisma.conversation.update({
    where: { id: ctx.conversationId },
    data: { currentProductId: product.id },
  });

  return {
    success: true,
    data: {
      productName: product.name,
      price: product.price,
      currency: product.currency,
      stockStatus: product.stockStatus,
      description: product.description,
    },
  };
};

const getProductDetails: ToolHandler = async (entities, ctx) => {
  const parsedArgs = GetProductDetailsArgsSchema.safeParse(entities);
  const productName = parsedArgs.success ? parsedArgs.data.productName : undefined;

  let product: Product | null = null;

  if (productName) {
    product = await prisma.product.findFirst({
      where: {
        merchantId: ctx.merchantId,
        name: { contains: productName, mode: 'insensitive' },
      },
    });
  } else if (ctx.currentProductId) {
    product = await prisma.product.findFirst({
      where: { id: ctx.currentProductId, merchantId: ctx.merchantId },
    });
  }

  if (!product) {
    return { success: false, error: 'Product not found' };
  }

  await prisma.conversation.update({
    where: { id: ctx.conversationId },
    data: { currentProductId: product.id },
  });

  return {
    success: true,
    data: {
      productName: product.name,
      description: product.description,
      price: product.price,
      currency: product.currency,
      stockStatus: product.stockStatus,
      category: product.category,
    },
  };
};

const createOrder: ToolHandler = async (entities, ctx) => {
  const parsedArgs = CreateOrderArgsSchema.safeParse(entities);
  if (!parsedArgs.success) {
    const missing = parsedArgs.error.issues.map(i => i.path.join('.')).join(', ');
    return { success: false, error: `Missing required fields: ${missing}` };
  }

  const { productId, product: productName, quantity } = parsedArgs.data;

  // Auto-fill wilaya/commune from saved customer delivery info if not provided
  const wilaya = parsedArgs.data.wilaya ?? ctx.customerWilaya ?? undefined;
  const communeInput = parsedArgs.data.commune;

  if (!wilaya) {
    return { success: false, error: 'Missing required field: wilaya' };
  }

  // Validate commune exists
  const communeCheck = await validateCommune(communeInput, wilaya);
  if (!communeCheck.valid) {
    if (communeCheck.suggestions?.length) {
      const list = communeCheck.suggestions.join(', ');
      return {
        success: false,
        error: `Baladia "${communeInput}" makanach. Chno khatrek? ${list}`,
      };
    }
    return {
      success: false,
      error: `Baladia "${communeInput}" makanach f l'wilaya dyal ${wilaya}.`,
    };
  }
  const commune = communeCheck.commune!;

  let product: Product | null = null;
  if (productId) {
    product = await prisma.product.findFirst({
      where: { id: productId, merchantId: ctx.merchantId },
    });
  }
  if (!product && productName) {
    product = await prisma.product.findFirst({
      where: { merchantId: ctx.merchantId, name: { contains: productName, mode: 'insensitive' } },
    });
  }
  if (!product && ctx.currentProductId) {
    product = await prisma.product.findFirst({
      where: { id: ctx.currentProductId, merchantId: ctx.merchantId },
    });
  }
  if (!product) {
    return { success: false, error: `Product not found. Choose a product first.` };
  }

  if (product.stockStatus === 'out_of_stock') {
    return { success: false, error: `Product "${product.name}" is out of stock` };
  }

  const deliveryCostRow = await prisma.wilayaDeliveryCost.findFirst({
    where: { merchantId: ctx.merchantId, wilaya: { equals: wilaya, mode: 'insensitive' } },
  });
  if (!deliveryCostRow) {
    console.warn(`[createOrder] no delivery cost configured for wilaya "${wilaya}" — defaulting to 0`);
  }
  const deliveryCostValue = deliveryCostRow?.cost ?? 0;
  const totalAmount = product.price * quantity + deliveryCostValue;

  const platformOrderId = `FAKE-${Date.now()}`;

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
    },
  });

  // Save delivery info to customer record for future orders
  await prisma.customer.update({
    where: { id: ctx.customerId },
    data: { wilaya, commune },
  });

  await prisma.conversation.update({
    where: { id: ctx.conversationId },
    data: { currentOrderId: order.id, state: 'WAITING_CONFIRMATION' },
  });

  await enqueueOrderJob(order.id);

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

  if (!ctx.currentOrderId) {
    return { success: false, error: 'No pending order in context to update' };
  }

  const order = await prisma.order.findFirst({
    where: {
      id: ctx.currentOrderId,
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
    console.error('[tools] Failed to create escalation notification:', err);
  }

  return { success: true, data: { escalated: true } };
};

export const toolRegistry: Record<ToolName, ToolHandler> = {
  searchProducts,
  recallPreviousProducts,
  chooseProduct,
  getProductDetails,
  createOrder,
  confirmOrder,
  modifyOrder,
  cancelOrder,
  calculateShipping,
  getOrderStatus,
  escalateConversation,
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