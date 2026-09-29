import type { Product } from '@prisma/client';
import type { ReadToolName, WriteToolName, ToolName } from '../schemas/intents.schemas';
import prisma from '../../../config/db.config';
import {
  toolSchemas,
  SearchProductsArgsSchema,
  GetOrderStatusArgsSchema,
  CalculateShippingArgsSchema,
  ConfirmOrderArgsSchema,
  CancelOrderArgsSchema,
  CreateOrderArgsSchema,
  SelectProductArgsSchema,
  GetProductDetailsArgsSchema,
  SuggestProductsArgsSchema,
  ModifyOrderArgsSchema,
  EscalateConversationArgsSchema,
} from '../schemas/intents.schemas';
import { enqueueOrderJob } from '../../../queues/order.queue';
import {
  buildProductCatalog,
  fetchProductsByIds,
  matchProductsWithLLM,
} from './searchHelpers';
import { TOOL_STATE_TRANSITIONS } from '../conversationState';
import {
  buildSuggestionPreferences,
  buildSuggestionCatalog,
  recentProducts,
  type PreferenceEntities,
} from './suggestionHelpers';

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

// Outcome refines `success`. It lets downstream code treat two very different
// failures distinctly:
//   - NOT_FOUND  → the item definitively does not exist (search came back empty).
//   - AMBIGUOUS  → the request is too vague to identify an item (ask to clarify).
// Absent on plain operational failures (bad args, missing context, infra errors).
export type ToolOutcome = 'SUCCESS' | 'NOT_FOUND' | 'AMBIGUOUS';

export interface ToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  outcome?: ToolOutcome;
}

type ToolEntities = Record<string, string | number | boolean | null>;
type ToolHandler = (entities: ToolEntities) => Promise<ToolResult>;

function parseOptionalJson<T>(value: string | null | undefined): T | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function formatProducts(products: Product[]) {
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    currency: p.currency,
    stockStatus: p.stockStatus,
  }));
}

const searchProducts: ToolHandler = async (entities) => {
  const parsedArgs = SearchProductsArgsSchema.safeParse(entities);
  if (!parsedArgs.success) {
    return { success: false, error: 'No product name provided to search for' };
  }
  const query = parsedArgs.data.product.trim();
  if (!query) {
    return { success: false, error: 'No product name provided to search for' };
  }

  // A pure explicit catalog query — no memory, no bare-reference resolution.
  // A name that is not in the catalog is authoritatively NOT_FOUND: the reply
  // must state that plainly instead of asking the customer which product they
  // mean.
  const fastResults = await prisma.product.findMany({
    where: { merchantId: parsedArgs.data.merchantId, name: { contains: query, mode: 'insensitive' } },
    take: 5,
  });
  if (fastResults.length) {
    return { success: true, data: { products: formatProducts(fastResults) } };
  }

  const catalog = await buildProductCatalog(parsedArgs.data.merchantId);
  if (catalog.length === 0) {
    return {
      success: false,
      outcome: 'NOT_FOUND',
      data: { query },
      error: `No product matching "${query}" exists in the store's catalog.`,
    };
  }

  const { ids } = await matchProductsWithLLM(catalog, query);
  if (ids.length) {
    const products = await fetchProductsByIds(parsedArgs.data.merchantId, ids);
    if (products.length) {
      return { success: true, data: { products: formatProducts(products.slice(0, 5)) } };
    }
  }

  return {
    success: false,
    outcome: 'NOT_FOUND',
    data: { query },
    error: `No product matching "${query}" exists in the store's catalog.`,
  };
};

const getOrderStatus: ToolHandler = async (entities) => {
  const parsedArgs = GetOrderStatusArgsSchema.safeParse(entities);
  if (!parsedArgs.success) {
    return { success: false, error: 'No order provided to check status for' };
  }
  const orderId = parsedArgs.data.orderId;

  const order = await prisma.order.findFirst({
    where: { id: orderId, merchantId: parsedArgs.data.merchantId, customerId: parsedArgs.data.customerId },
  });

  if (!order) {
    return { success: false, outcome: 'NOT_FOUND', error: 'Order not found' };
  }

  return {
    success: true,
    data: { orderId: order.id, status: order.status, trackingNumber: order.trackingNumber },
  };
};

const calculateShipping: ToolHandler = async (entities) => {
  const parsedArgs = CalculateShippingArgsSchema.safeParse(entities);
  if (!parsedArgs.success) {
    return { success: false, error: 'No wilaya provided to calculate shipping for' };
  }

  const cost = await prisma.wilayaDeliveryCost.findFirst({
    where: { merchantId: parsedArgs.data.merchantId, wilaya: { equals: parsedArgs.data.wilaya, mode: 'insensitive' } },
  });

  if (!cost) {
    return {
      success: false,
      outcome: 'NOT_FOUND',
      error: `No delivery cost configured for "${parsedArgs.data.wilaya}"`,
    };
  }

  return { success: true, data: { wilaya: cost.wilaya, cost: cost.cost } };
};

const confirmOrder: ToolHandler = async (entities) => {
  const parsedArgs = ConfirmOrderArgsSchema.safeParse(entities);

  if (!parsedArgs.success) {
    return { success: false, error: 'Missing order confirmation parameters' };
  }

  try {
    const order = await prisma.order.update({
      where: {
        id: parsedArgs.data.orderId,
        merchantId: parsedArgs.data.merchantId,
        customerId: parsedArgs.data.customerId,
      },
      data: {
        status: 'CONFIRMED',
      },
    });

    await prisma.conversation.update({
      where: { id: parsedArgs.data.conversationId },
      data: { state: TOOL_STATE_TRANSITIONS.confirmOrder! },
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

const cancelOrder: ToolHandler = async (entities) => {
  const parsedArgs = CancelOrderArgsSchema.safeParse(entities);

  if (!parsedArgs.success) {
    return { success: false, error: 'Missing order cancellation parameters' };
  }

  try {
    const existing = await prisma.order.findFirst({
      where: {
        id: parsedArgs.data.orderId,
        merchantId: parsedArgs.data.merchantId,
        customerId: parsedArgs.data.customerId,
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
        id: parsedArgs.data.orderId,
        merchantId: parsedArgs.data.merchantId,
        customerId: parsedArgs.data.customerId,
      },
      data: {
        status: 'CANCELLED',
      },
    });

    await prisma.conversation.update({
      where: { id: parsedArgs.data.conversationId },
      data: { state: TOOL_STATE_TRANSITIONS.cancelOrder! },
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

const selectProduct: ToolHandler = async (entities) => {
  const parsedArgs = SelectProductArgsSchema.safeParse(entities);
  if (!parsedArgs.success) {
    return { success: false, error: 'No product name or product id provided to select' };
  }

  let product: Product | null = null;

  if (parsedArgs.data.productId) {
    product = await prisma.product.findFirst({
      where: { id: parsedArgs.data.productId, merchantId: parsedArgs.data.merchantId },
    });
  } else if (parsedArgs.data.productName) {
    product = await prisma.product.findFirst({
      where: {
        merchantId: parsedArgs.data.merchantId,
        name: { contains: parsedArgs.data.productName, mode: 'insensitive' },
      },
    });
  }

  if (!product) {
    return { success: false, outcome: 'NOT_FOUND', error: 'Product not found' };
  }

  return {
    success: true,
    data: {
      productId: product.id,
      productName: product.name,
      price: product.price,
      currency: product.currency,
      stockStatus: product.stockStatus,
      description: product.description,
    },
  };
};

const getProductDetails: ToolHandler = async (entities) => {
  const parsedArgs = GetProductDetailsArgsSchema.safeParse(entities);
  if (!parsedArgs.success) {
    return { success: false, error: 'Missing product details context' };
  }
  const productName = parsedArgs.data.productName;

  let product: Product | null = null;

  if (productName) {
    product = await prisma.product.findFirst({
      where: {
        merchantId: parsedArgs.data.merchantId,
        name: { contains: productName, mode: 'insensitive' },
      },
    });
  } else if (parsedArgs.data.productId) {
    product = await prisma.product.findFirst({
      where: { id: parsedArgs.data.productId, merchantId: parsedArgs.data.merchantId },
    });
  }

  if (!product) {
    return { success: false, outcome: 'NOT_FOUND', error: 'Product not found' };
  }

  return {
    success: true,
    data: {
      productId: product.id,
      productName: product.name,
      description: product.description,
      price: product.price,
      currency: product.currency,
      stockStatus: product.stockStatus,
      category: product.category,
    },
  };
};

const suggestProducts: ToolHandler = async (entities) => {
  const parsedArgs = SuggestProductsArgsSchema.safeParse(entities);
  if (!parsedArgs.success) {
    return { success: false, error: 'Missing suggestion context' };
  }

  // Explicit criteria only — abandoned/discussed product ids arrive as the
  // injected excludedProductIds (JSON string, transport-computed from
  // conversation memory). The tool never reads memory itself, so there is no
  // memory consolidation step here.
  const prefs = buildSuggestionPreferences(parsedArgs.data as unknown as PreferenceEntities);
  const excludeIds = parseOptionalJson<string[]>(parsedArgs.data.excludedProductIds) ?? [];

  const hasPreferences =
    prefs.terms.length > 0 ||
    prefs.category !== undefined ||
    prefs.minPrice !== undefined ||
    prefs.maxPrice !== undefined;

  let products: Product[];
  let basedOn: 'preferences' | 'popular';

  if (!hasPreferences) {
    // Bare "what do you recommend?" with no explicit signal → recent in-stock items.
    products = await recentProducts(parsedArgs.data.merchantId, excludeIds);
    basedOn = 'popular';
  } else {
    const catalog = await buildSuggestionCatalog(parsedArgs.data.merchantId, prefs, excludeIds);
    if (catalog.length === 0) {
      return {
        success: false,
        outcome: 'NOT_FOUND',
        error: 'No products in the store match those preferences.',
      };
    }

    // Rank the SQL-filtered candidates with the LLM matcher (same ranking path
    // as searchProducts); fall back to the SQL order when the matcher yields
    // nothing.
    const query = prefs.terms.join(', ') || 'recommended product';
    const { ids } = await matchProductsWithLLM(catalog, query);
    const ranked = ids.length ? await fetchProductsByIds(parsedArgs.data.merchantId, ids) : [];
    products = ranked.length
      ? ranked.slice(0, 5)
      : await fetchProductsByIds(parsedArgs.data.merchantId, catalog.slice(0, 5).map((c) => c.id));
    basedOn = 'preferences';
  }

  if (products.length === 0) {
    return {
      success: false,
      outcome: 'NOT_FOUND',
      error: 'No products available to recommend right now.',
    };
  }

  return {
    success: true,
    data: { products: formatProducts(products), recommended: true, basedOn },
  };
};

const createOrder: ToolHandler = async (entities) => {
  const parsedArgs = CreateOrderArgsSchema.safeParse(entities);
  if (!parsedArgs.success) {
    const missing = parsedArgs.error.issues.map(i => i.path.join('.')).join(', ');
    return { success: false, error: `Missing required fields: ${missing}` };
  }

  const { productId, quantity, wilaya, address } = parsedArgs.data;
  const communeInput = parsedArgs.data.commune;

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

  const product = await prisma.product.findFirst({
    where: { id: productId, merchantId: parsedArgs.data.merchantId },
  });
  if (!product) {
    return { success: false, error: `Product not found. Choose a product first.` };
  }

  if (product.stockStatus === 'out_of_stock') {
    return { success: false, error: `Product "${product.name}" is out of stock` };
  }

  const deliveryCostRow = await prisma.wilayaDeliveryCost.findFirst({
    where: { merchantId: parsedArgs.data.merchantId, wilaya: { equals: wilaya, mode: 'insensitive' } },
  });
  if (!deliveryCostRow) {
    console.warn(`[createOrder] no delivery cost configured for wilaya "${wilaya}" — defaulting to 0`);
  }
  const deliveryCostValue = deliveryCostRow?.cost ?? 0;
  const totalAmount = product.price * quantity + deliveryCostValue;

  const platformOrderId = `FAKE-${Date.now()}`;

  const order = await prisma.order.create({
    data: {
      merchantId: parsedArgs.data.merchantId,
      customerId: parsedArgs.data.customerId,
      platformOrderId,
      wilaya,
      commune,
      address,
      productId: product.id,
      productName: product.name,
      quantity,
      totalAmount,
      deliveryCost: deliveryCostValue,
    },
  });

  // Save delivery info to customer record for future orders
  await prisma.customer.update({
    where: { id: parsedArgs.data.customerId },
    data: { wilaya, commune },
  });

  await prisma.conversation.update({
    where: { id: parsedArgs.data.conversationId },
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
      address: order.address,
    },
  };
};

const modifyOrder: ToolHandler = async (entities) => {
  const parsedArgs = ModifyOrderArgsSchema.safeParse(entities);
  if (!parsedArgs.success) {
    return { success: false, error: 'No fields provided to modify' };
  }

  const order = await prisma.order.findFirst({
    where: {
      id: parsedArgs.data.orderId,
      merchantId: parsedArgs.data.merchantId,
      customerId: parsedArgs.data.customerId,
      status: 'PENDING',
    },
  });

  if (!order) {
    return { success: false, error: 'No pending order found to update' };
  }

  // Resolve the product to get current price for total recalculation
  const product = await prisma.product.findFirst({
    where: { id: order.productId, merchantId: parsedArgs.data.merchantId },
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
      where: { merchantId: parsedArgs.data.merchantId, wilaya: { equals: parsedArgs.data.wilaya, mode: 'insensitive' } },
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
      where: { id: parsedArgs.data.customerId },
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

const escalateConversation: ToolHandler = async (entities) => {
  const parsedArgs = EscalateConversationArgsSchema.safeParse(entities);
  if (!parsedArgs.success) {
    return { success: false, error: 'Missing escalation context' };
  }
  const { merchantId, customerId, conversationId, reason } = parsedArgs.data;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) {
    return { success: false, error: 'Conversation not found' };
  }

  // Idempotent — one escalation per conversation.
  if (conversation.takenOverByHuman) {
    return { success: true, data: { escalated: false } };
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { takenOverByHuman: true, escalatedAt: new Date() },
  });

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, phone: true },
  });

  try {
    await prisma.notification.create({
      data: {
        merchantId,
        type: 'escalation',
        title: 'Conversation escaladée',
        message: `Le client ${customer?.name || customer?.phone || 'inconnu'} a besoin d'un agent: ${reason}`,
        link: '/dashboard/escalations',
      },
    });
  } catch (err) {
    console.error('[tools] Failed to create escalation notification:', err);
  }

  return { success: true, data: { escalated: true, reason } };
};

// Read tools have no business side-effects (orders/customer/takeover untouched;
// conversation navigation state/memory is fine). They are suppressed while a
// human owns the conversation.
export const readToolRegistry: Record<ReadToolName, ToolHandler> = {
  searchProducts,
  selectProduct,
  getProductDetails,
  suggestProducts,
  calculateShipping,
  getOrderStatus,
};

// Write tools mutate business data (order lifecycle, customer profile, takeover
// flag). They execute even while a human owns the conversation.
export const writeToolRegistry: Record<WriteToolName, ToolHandler> = {
  createOrder,
  confirmOrder,
  modifyOrder,
  cancelOrder,
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
): Promise<ToolResult> => {
  const parsed = toolSchemas[toolName].safeParse(entities);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { success: false, error: issue?.message ?? 'Invalid tool arguments' };
  }
  try {
    return await toolRegistry[toolName](parsed.data as ToolEntities);
  } catch (err) {
    console.error(`[tools] "${toolName}" threw an unexpected error`, err);
    return { success: false, error: 'Tool execution failed unexpectedly' };
  }
};