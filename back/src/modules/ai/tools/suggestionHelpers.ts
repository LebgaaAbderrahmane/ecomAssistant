import type { Prisma, Product } from '@prisma/client';
import prisma from '../../../config/db.config';
import type { ConversationMemory } from '../memory.types';
import type { CatalogEntry } from './searchHelpers';

// ─── suggestProducts context ─────────────────────────────────────────────
// Pure helpers that turn explicit customer-signal entities into a
// recommendation query.  The tool receives ONLY explicit params from the
// LLM plus injected transport keys — it never reads conversation memory
// itself.  Memory-derived exclusions are computed by the transport
// (toolContext / grpc ToolService) and passed as `excludedProductIds`.

export interface SuggestionPreferences {
  category?: string;
  color?: string;
  size?: string;
  minPrice?: number;
  maxPrice?: number;
  terms: string[];
}

export type PreferenceEntities = Record<string, string | number | boolean | null>;

/**
 * Build SuggestionPreferences from explicit message entities only.
 * The tool receives this from the parsed zod args — no memory merge.
 */
export function buildSuggestionPreferences(entities: PreferenceEntities): SuggestionPreferences {
  const stringVal = (key: string): string | undefined => {
    const value = entities[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    return undefined;
  };

  const numberVal = (key: string): number | undefined => {
    const value = entities[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    return undefined;
  };

  const terms: string[] = [];
  for (const key of ['category', 'color', 'size'] as const) {
    const value = stringVal(key);
    if (value) terms.push(value);
  }
  const preferences = stringVal('preferences');
  if (preferences) terms.push(preferences);

  return {
    category: stringVal('category'),
    color: stringVal('color'),
    size: stringVal('size'),
    minPrice: numberVal('minPrice'),
    maxPrice: numberVal('maxPrice'),
    terms,
  };
}

/**
 * Product ids that must never be suggested again: products already presented
 * in this exchange (lastProductResults), products the customer rejected
 * (rejectedProducts), and the currently selected product.  Used by the
 * transport to populate `excludedProductIds` before calling the tool.
 */
export function memoryExclusionIds(memory: ConversationMemory, currentProductId?: string | null): string[] {
  const ids = new Set<string>();
  for (const list of [memory.lastProductResults ?? [], memory.rejectedProducts ?? []]) {
    for (const entry of list) {
      if (entry?.id) ids.add(entry.id);
    }
  }
  if (currentProductId) ids.add(currentProductId);
  return [...ids];
}

export interface CandidatePoolFilter extends SuggestionPreferences {
  merchantId: string;
  excludeIds: string[];
}

/**
 * Build the Prisma where clause for the candidate pool: merchant's in-stock
 * catalog, narrowed by the known preference filters, with rejected/discussed
 * products excluded.
 */
export function buildProductWhere(filter: CandidatePoolFilter): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    merchantId: filter.merchantId,
    agentEnabled: true,
  };

  if (filter.excludeIds.length) {
    where.id = { notIn: filter.excludeIds };
  }

  const and: Prisma.ProductWhereInput[] = [];

  if (filter.category) {
    and.push({ category: { contains: filter.category, mode: 'insensitive' } });
  }

  if (filter.minPrice !== undefined || filter.maxPrice !== undefined) {
    const price: Prisma.FloatFilter = {};
    if (filter.minPrice !== undefined) price.gte = filter.minPrice;
    if (filter.maxPrice !== undefined) price.lte = filter.maxPrice;
    and.push({ price });
  }

  const termClauses = filter.terms
    .filter((term) => term.trim())
    .map((term) => ({
      OR: [
        { name: { contains: term, mode: 'insensitive' as const } },
        { description: { contains: term, mode: 'insensitive' as const } },
      ],
    }));
  if (termClauses.length) {
    and.push({ AND: termClauses });
  }

  if (and.length) where.AND = and;
  return where;
}

/**
 * SQL candidate pool for the LLM ranking stage — id/name/description/variants
 * only (the shape the matcher expects), newest first, capped like the search.
 */
export async function buildSuggestionCatalog(
  merchantId: string,
  prefs: SuggestionPreferences,
  excludeIds: string[],
): Promise<CatalogEntry[]> {
  const where = buildProductWhere({ merchantId, ...prefs, excludeIds });
  const products = await prisma.product.findMany({
    where,
    select: { id: true, name: true, description: true, variants: true },
    take: 200,
    orderBy: { createdAt: 'desc' },
  });
  return products;
}

/** Recent in-stock products — the fallback when there is no preference signal. */
export async function recentProducts(
  merchantId: string,
  excludeIds: string[],
  limit = 5,
): Promise<Product[]> {
  return prisma.product.findMany({
    where: {
      merchantId,
      agentEnabled: true,
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
