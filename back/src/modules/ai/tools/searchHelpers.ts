import type { Product } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../../config/db.config';
import { callLLM } from '../clients/llm.client';

const CATALOG_LIMIT = 200;

export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  variants: unknown;
}

// ─── LLM product matching (stage: catalog search) ───────────────────────
// The matcher does two things in a single call:
//   1. Finds catalog IDs that match the query (the actual search).
//   2. Classifies whether the query names a concrete product at all
//      (isReference=false) or merely points at something previously
//      discussed — "the black one", "this one", "hadak" (isReference=true).
// That classification is what allows us to ask "which product do you mean?"
// ONLY when the reference cannot be resolved from conversation context —
// never to second-guess a concrete product request that came up empty.

const ProductMatchSchema = z.object({
  matches: z.array(
    z.object({
      id: z.string(),
      confidence: z.number(),
    }),
  ),
  isReference: z.boolean().default(false),
});

const PRODUCT_MATCH_SYSTEM_PROMPT = `You are a product matcher for an e-commerce store. Given a product catalog and a customer search query, return a JSON object with two fields:

1. "matches": an array of matching product IDs ranked by relevance (most relevant first).
2. "isReference": a boolean — true if the query does NOT name a concrete product but instead points to something already discussed in the conversation (e.g. "the black one", "this one", "the large one", "hadak", "celui-ci", "the second one"). A query that names a product type, brand, or model (e.g. "iphone 15", "cargo", "sac noir") is NOT a reference.

Rules:
- Only return product IDs that exist in the provided catalog.
- Do not invent or hallucinate product IDs.
- Do not generate any customer-facing text.
- If nothing matches, return an empty "matches" array.
- Decide "isReference" from the query wording alone, independent of whether matches exist.`;

const PRODUCT_MATCH_SCHEMA = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['id', 'confidence'],
      },
    },
    isReference: { type: 'boolean' },
  },
  required: ['matches', 'isReference'],
};

export async function buildProductCatalog(merchantId: string): Promise<CatalogEntry[]> {
  const products = await prisma.product.findMany({
    where: { merchantId },
    select: {
      id: true,
      name: true,
      description: true,
      variants: true,
    },
    take: CATALOG_LIMIT,
    orderBy: { createdAt: 'desc' },
  });
  return products;
}

export async function matchProductsWithLLM(
  catalog: CatalogEntry[],
  query: string,
): Promise<{ ids: string[]; isReference: boolean }> {
  const userMessage = `Catalog:\n${JSON.stringify(catalog)}\n\nSearch query: ${query}`;

  const raw = await callLLM({
    systemPrompt: PRODUCT_MATCH_SYSTEM_PROMPT,
    userMessage,
    responseSchema: PRODUCT_MATCH_SCHEMA,
  });

  let parsed: z.infer<typeof ProductMatchSchema>;
  try {
    const json = JSON.parse(raw);
    parsed = ProductMatchSchema.parse(json);
  } catch {
    console.warn('[searchHelpers] LLM product match response was invalid, treating as no matches');
    return { ids: [], isReference: false };
  }

  return {
    ids: parsed.matches
      .sort((a, b) => b.confidence - a.confidence)
      .map((m) => m.id),
    isReference: parsed.isReference,
  };
}

export async function fetchProductsByIds(
  merchantId: string,
  ids: string[],
): Promise<Product[]> {
  if (ids.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: ids }, merchantId },
  });

  // Preserve LLM rank order
  const productMap = new Map(products.map((p) => [p.id, p]));
  return ids
    .map((id) => productMap.get(id))
    .filter((p): p is Product => Boolean(p));
}
