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

const ProductMatchSchema = z.object({
  matches: z.array(
    z.object({
      id: z.string(),
      confidence: z.number(),
    }),
  ),
});

const PRODUCT_MATCH_SYSTEM_PROMPT = `You are a product matcher for an e-commerce store. Given a product catalog and a customer search query, return a JSON array of matching product IDs ranked by relevance (most relevant first).

Rules:
- Only return product IDs that exist in the provided catalog.
- Do not invent or hallucinate product IDs.
- Do not generate any customer-facing text.
- If nothing matches, return an empty array.`;

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
  },
  required: ['matches'],
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
): Promise<string[]> {
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
    return [];
  }

  return parsed.matches
    .sort((a, b) => b.confidence - a.confidence)
    .map((m) => m.id);
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
