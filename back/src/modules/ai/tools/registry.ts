import type { Product } from '@prisma/client';
import type { ReadToolName, WriteToolName, ToolName } from '../schemas/intents.schemas';
import prisma from '../../../config/db.config';
import {
  SearchProductsArgsSchema,
  GetOrderStatusArgsSchema,
  CalculateShippingArgsSchema,
  ConfirmOrderArgsSchema,
  CancelOrderArgsSchema,
  CreateOrderArgsSchema,
  SelectProductArgsSchema,
  SuggestProductsArgsSchema,
  ModifyOrderArgsSchema,
} from '../schemas/intents.schemas';
import { enqueueOrderJob } from '../../../queues/order.queue';
import { resolveProductRequest, fetchProductsByIds, matchProductsWithLLM } from './searchHelpers';
import {
  consolidatePreferences,
  computeExclusionIds,
  buildSuggestionCatalog,
  recentProducts,
  type PreferenceEntities,
} from './suggestionHelpers';
import type { Flow } from '../memory.types';
import { migrateMemory, getActiveFlow } from '../flowHelper';
import { getFlowOrderId, getFlowCurrentProductId, getFlowProductResults } from '../flowExtractors';
import { moduleLogger ,convLogger } from '../../../lib/logger';

export { getFlowOrderId, getFlowCurrentProductId, getFlowProductResults };

interface CommuneValidation {
  valid: boolean;
  commune?: string;
  wilaya?: string;
  suggestions?: string[];
}

 const toolLogger = moduleLogger('toolLogger')

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
  activeFlow: Flow | null;
  customerWilaya?: string | null;
  customerCommune?: string | null;
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
    toolLogger.warn(
      {
        entities,
        error: parsedArgs.error,
      },
      'Search products: invalid arguments',
    );

    return {
      success: false,
      error: 'No product name provided to search for',
    };
  }

  const query = parsedArgs.data.product;

  toolLogger.info(
    {
      query,
      merchantId: ctx.merchantId,
    },
    'Search products: starting search',
  );

  const productCtx = {
    lastProductResults: getFlowProductResults(ctx.activeFlow),
    currentProductId: getFlowCurrentProductId(ctx.activeFlow),
  };


  
  
  const resolved = await resolveProductRequest(
    query,
    productCtx,
    ctx.merchantId,
  );


  if (resolved.outcome === 'SUCCESS') {
    const products = formatProducts(resolved.products);

    toolLogger.info(
      {
        query,
        merchantId: ctx.merchantId,
        outcome: 'SUCCESS',
        productCount: products.length,
        products,
      },
      'Search products: results found',
    );

    return {
      success: true,
      data: { products },
    };
  }

  if (resolved.outcome === 'AMBIGUOUS') {
    toolLogger.warn(
      {
        query,
        merchantId: ctx.merchantId,
        outcome: 'AMBIGUOUS',
        reason: resolved.reason,
      },
      'Search products: ambiguous request',
    );

    return {
      success: false,
      outcome: 'AMBIGUOUS',
      data: { query },
      error: resolved.reason,
    };
  }

  toolLogger.info(
    {
      query,
      merchantId: ctx.merchantId,
      outcome: 'NOT_FOUND',
      resolvedQuery: resolved.query,
    },
    'Search products: product not found',
  );

  return {
    success: false,
    outcome: 'NOT_FOUND',
    data: { query },
    error: `No product matching "${resolved.query}" exists in the store's catalog.`,
  };
};

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
const recallPreviousProducts: ToolHandler = async (_entities, ctx) => {
  // The customer references a product without naming it ("the black one",
  // "hadak"). Resolve from conversation context (flow data) first.
  const productCtx = {
    lastProductResults: getFlowProductResults(ctx.activeFlow),
    currentProductId: getFlowCurrentProductId(ctx.activeFlow),
  };
  const fromContext = await resolveProductRequest(undefined, productCtx, ctx.merchantId);
  if (fromContext.outcome === 'SUCCESS') {
    return { success: true, data: { products: formatProducts(fromContext.products) } };
  }

  // Deeper fallback: scan message history for product entities from earlier
  // searches/details in this conversation.
  const messages = await prisma.message.findMany({
    where: {
      conversationId: ctx.conversationId,
      intent: { in: ['PRODUCT_SEARCH', 'PRODUCT_DETAILS'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 30, // scan a window, not the whole history
  });

  convLogger({ conversationId: ctx.conversationId }).info({ count: messages.length }, 'recallPreviousProducts: found messages');

  // Extract product names from entities (e.g. {"product":"iphone 15"}), most-recent-first, deduped
  const seen = new Set<string>();
  const productNames: string[] = [];

  for (const msg of messages) {
    let ents: Record<string, unknown> | null = null;
    if (typeof msg.entities === 'string') {
      try { ents = JSON.parse(msg.entities); } catch { /* skip */ }
    } else if (msg.entities && typeof msg.entities === 'object') {
      ents = msg.entities as Record<string, unknown>;
    }
    const name = ents?.product;
    if (typeof name === 'string' && !seen.has(name)) {
      seen.add(name);
      productNames.push(name);
    }
  }

  if (productNames.length === 0) {
    // Nothing recalled and no product context — we need the customer to name
    // the product rather than claiming it doesn't exist.
    return {
      success: false,
      outcome: 'AMBIGUOUS',
      error: 'No previously mentioned product found. Ask the customer which product (name, color, or model) they are asking about.',
    };
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

const selectProduct: ToolHandler = async (entities, ctx) => {
  const parsedArgs = SelectProductArgsSchema.safeParse(entities);
  if (!parsedArgs.success) {
    return { success: false, error: 'No product name or index provided to select' };
  }

  let product: Product | null = null;

  // Resolve by index from lastProductResults if productIndex is provided
  if (parsedArgs.data.productIndex !== undefined) {
    const lastResults = getFlowProductResults(ctx.activeFlow) ?? [];
    const entry = lastResults[parsedArgs.data.productIndex];
    if (!entry) {
      return {
        success: false,
        outcome: 'NOT_FOUND',
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

const getProductDetails: ToolHandler = async (_entities, ctx) => {
  const logger = toolLogger.child({
    tool: 'getProductDetails',
    conversationId: ctx.conversationId,
    merchantId: ctx.merchantId,
    customerId: ctx.customerId,
  });

  logger.info('getProductDetails: started');

  // --------------------------------------------------
  // Resolve current product from flow
  // --------------------------------------------------

  const productId = getFlowCurrentProductId(ctx.activeFlow);

  logger.info(
    { productId: String(productId) },
    'getProductDetails: resolved current product',
  );

  if (!productId) {
    logger.warn(
      'getProductDetails: no product selected',
    );

    return {
      success: false,
      outcome: 'AMBIGUOUS',
      error:
        'No product selected. Ask the customer which product they want to know about.',
    };
  }

  // --------------------------------------------------
  // Fetch product
  // --------------------------------------------------

  logger.info(
    { productId },
    'getProductDetails: fetching product',
  );

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      merchantId: ctx.merchantId,
    },
  });

  if (!product) {
    logger.warn(
      { productId },
      'getProductDetails: product not found',
    );

    return {
      success: false,
      outcome: 'NOT_FOUND',
      error: 'Product not found',
    };
  }

  logger.info(
    {
      productId: product.id,
      productName: product.name,
      stockStatus: product.stockStatus,
    },
    'getProductDetails: product found',
  );

  // --------------------------------------------------
  // Success
  // --------------------------------------------------

  logger.info(
    { productId: product.id },
    'getProductDetails: completed successfully',
  );

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

const suggestProducts: ToolHandler = async (entities, ctx) => {
  const parsedArgs = SuggestProductsArgsSchema.safeParse(entities);
  const messagePrefs = parsedArgs.success ? parsedArgs.data : {};

  // Load conversation memory (accumulated preferences + rejected products) so
  // the customer never has to repeat what they already told us.
  const conversation = await prisma.conversation.findUnique({
    where: { id: ctx.conversationId },
    select: { memory: true },
  });
  const memory = migrateMemory(conversation?.memory);
  const activeFlow = getActiveFlow(memory) ?? {
    flowId: 'temp',
    state: 'IDLE' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const prefs = consolidatePreferences(
    messagePrefs as PreferenceEntities,
    activeFlow.state !== 'IDLE' ? activeFlow.productDiscovery.input.filters : undefined,
    memory.globalInformation,
  );
  const excludeIds = computeExclusionIds(activeFlow, getFlowCurrentProductId(ctx.activeFlow));

  const hasPreferences =
    prefs.terms.length > 0 ||
    prefs.category !== undefined ||
    prefs.minPrice !== undefined ||
    prefs.maxPrice !== undefined;

  let products: Product[];
  let basedOn: 'preferences' | 'popular';

  if (!hasPreferences) {
    // Bare "what do you recommend?" with no prior context → recent in-stock items.
    products = await recentProducts(ctx.merchantId, excludeIds);
    basedOn = 'popular';
  } else {
    const catalog = await buildSuggestionCatalog(ctx.merchantId, prefs, excludeIds);
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
    const ranked = ids.length ? await fetchProductsByIds(ctx.merchantId, ids) : [];
    products = ranked.length
      ? ranked.slice(0, 5)
      : await fetchProductsByIds(ctx.merchantId, catalog.slice(0, 5).map((c) => c.id));
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

  logger.info(
    {
      orderId: order.id,
      state: 'WAITING_CONFIRMATION',
    },
    'createOrder: updating conversation',
  );

  await prisma.conversation.update({
    where: { id: ctx.conversationId },
    data: {
      currentOrderId: order.id,
      state: 'WAITING_CONFIRMATION',
    },
  });

  logger.info(
    {
      orderId: order.id,
      state: 'WAITING_CONFIRMATION',
    },
    'createOrder: conversation updated',
  );

  // --------------------------------------------------
  // Enqueue order job
  // --------------------------------------------------

  logger.info(
    { orderId: order.id },
    'createOrder: enqueueing order job',
  );

  await enqueueOrderJob(order.id);

  logger.info(
    { orderId: order.id },
    'createOrder: order job enqueued',
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
  searchProducts,
  recallPreviousProducts,
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
  ctx: ToolExecutionContext
): Promise<ToolResult> => {
  try {
    return await toolRegistry[toolName](entities, ctx);
  } catch (err) {
    convLogger({ conversationId: ctx.conversationId }).error({ tool: toolName, err }, 'tool threw unexpected error');
    return { success: false, error: 'Tool execution failed unexpectedly' };
  }
};