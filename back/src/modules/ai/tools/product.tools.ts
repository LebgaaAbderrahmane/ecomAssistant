import type { Product } from '@prisma/client';
import prisma from '../../../config/db.config';
import {
  SearchProductsArgsSchema,
  SelectProductArgsSchema,
  GetProductDetailsArgsSchema,
  SuggestProductsArgsSchema,
} from '../schemas/intents.schemas';
import { resolveProductRequest, fetchProductsByIds, matchProductsWithLLM } from './searchHelpers';
import {
  consolidatePreferences,
  computeExclusionIds,
  buildSuggestionCatalog,
  recentProducts,
  type PreferenceEntities,
} from './suggestionHelpers';
import type { Flow } from '../memory.types';
import { migrateMemory, getActiveFlow } from '../flow/flowHelper';
import { getFlowCurrentProductId, getFlowProductResults } from '../flow/flowExtractors';
import { moduleLogger, convLogger } from '../../../lib/logger';
import type { ToolHandler, ToolExecutionContext, ToolResult } from './tool.types';

const toolLogger = moduleLogger('toolLogger');

function formatProducts(products: Product[]) {
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    currency: p.currency,
    stockStatus: p.stockStatus,
  }));
}

/** Per-product cards carrying the image URLs for the messaging layer. These are
 *  returned alongside an LLM-facing `products` payload (which stays lean — no
 *  images) so Phase C can send each search result's images as their own
 *  WhatsApp messages. */
function formatProductCards(products: Product[]) {
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    currency: p.currency,
    images: Array.isArray(p.images)
      ? (p.images as unknown[]).filter((u): u is string => typeof u === 'string')
      : [],
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

  const query = parsedArgs.data.product ?? parsedArgs.data.productName;

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
      data: {
        products,
        productCards: formatProductCards(resolved.products),
      },
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

const recallPreviousProducts: ToolHandler = async (_entities, ctx) => {
  // The customer references a product without naming it ("the black one",
  // "hadak"). Resolve from conversation context (flow data) first.
  const productCtx = {
    lastProductResults: getFlowProductResults(ctx.activeFlow),
    currentProductId: getFlowCurrentProductId(ctx.activeFlow),
  };
  const fromContext = await resolveProductRequest(undefined, productCtx, ctx.merchantId);
  if (fromContext.outcome === 'SUCCESS') {
    return {
      success: true,
      data: {
        products: formatProducts(fromContext.products),
        productCards: formatProductCards(fromContext.products),
      },
    };
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
      productCards: formatProductCards(ordered),
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

const getProductDetails: ToolHandler = async (entities, ctx) => {
  const logger = toolLogger.child({
    tool: 'getProductDetails',
    conversationId: ctx.conversationId,
    merchantId: ctx.merchantId,
    customerId: ctx.customerId,
  });

  const parsedArgs = GetProductDetailsArgsSchema.safeParse(entities);
  if (!parsedArgs.success) {
    logger.warn({ error: parsedArgs.error.flatten() }, 'getProductDetails: invalid args');
    return { success: false, outcome: 'AMBIGUOUS', error: 'No product details requested.' };
  }
  // Default: name only (name is always returned) + price when no field is asked.
  const requestedFields = new Set(parsedArgs.data.details);
  const wants = (field: string) => requestedFields.has(field as never);

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

  // productId + productName are always present so downstream tooling (and the
  // reply) can identify the product. Everything else is included ONLY if the
  // customer asked for it — name + price is the default when no field is asked.
  const images = Array.isArray(product.images)
    ? (product.images as unknown[]).filter((u): u is string => typeof u === 'string')
    : [];

  const data: Record<string, unknown> = {
    productId: product.id,
    productName: product.name,
  };

  if (requestedFields.size === 0 || wants('price')) {
    data.price = product.price;
    data.currency = product.currency;
  }
  if (wants('images')) data.productImages = images;
  if (wants('description')) data.description = product.description;
  if (wants('variants')) data.variants = product.variants;
  if (wants('stock')) data.stockStatus = product.stockStatus;
  if (wants('category')) data.category = product.category;

  logger.info(
    { productId: product.id, requestedFields: [...requestedFields] },
    'getProductDetails: completed successfully',
  );

  return { success: true, data };
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
    const { ids } = await matchProductsWithLLM(catalog, query, {
      merchantId: ctx.merchantId,
      conversationId: ctx.conversationId,
    });
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

export const productTools = {
  searchProducts,
  recallPreviousProducts,
  selectProduct,
  getProductDetails,
  suggestProducts,
};
