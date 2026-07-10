import prisma from "../../config/db.config";
import { PaginatedResult } from "../../types/pagination.types";
import type { Product } from "@prisma/client";
import eventBus from "../../events/eventBus";

interface GetProductsParams {
  merchantId: string;
  cursor?: string;
  limit?: number | string;
  search?: string;
  stockStatus?: string;
}

const encodeCursor = (createdAt: Date, id: string): string =>
  Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString("base64url");

const decodeCursor = (cursor: string): { createdAt: Date; id: string } => {
  const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  return { createdAt: new Date(decoded.createdAt), id: decoded.id };
};

export const getProducts = async (
  params: GetProductsParams,
): Promise<PaginatedResult<Product>> => {
  const { merchantId, cursor, search, stockStatus } = params;
  const limit = Math.min(Number(params.limit) || 20, 100);

  const where: any = { merchantId };
  if (stockStatus) where.stockStatus = { in: stockStatus.split(',') };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  let cursorWhere = {};
  let decodedCursor: { createdAt: Date; id: string } | null = null;

  if (cursor) {
    decodedCursor = decodeCursor(cursor);
    cursorWhere = {
      OR: [
        { createdAt: { lt: decodedCursor.createdAt } },
        {
          createdAt: { equals: decodedCursor.createdAt },
          id: { lt: decodedCursor.id },
        },
      ],
    };
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where: { ...where, ...cursorWhere },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    }),
    prisma.product.count({ where }),
  ]);

  const hasNextPage = products.length > limit;
  if (hasNextPage) products.pop();

  const nextCursor =
    hasNextPage
      ? encodeCursor(products[products.length - 1].createdAt, products[products.length - 1].id)
      : null;

  const prevCursor = decodedCursor
    ? encodeCursor(products[0].createdAt, products[0].id)
    : null;

  return {
    data: products,
    pagination: {
      total,
      hasNextPage,
      hasPrevPage: !!cursor,
      nextCursor,
      prevCursor,
    },
  };
};

export const upsertSingleProduct = async (
  merchantId: string,
  shopifyProduct: any,
): Promise<void> => {
  const p = shopifyProduct;
  const price = parseFloat(p.variants?.[0]?.price ?? "0");
  const images = (p.images ?? []).map((img: { src: string }) => img.src);
  const stockStatus =
    (p.variants?.[0]?.inventory_quantity ?? 0) > 0
      ? "in_stock"
      : "out_of_stock";

  await prisma.product.upsert({
    where: {
      merchantId_platformProductId: {
        merchantId,
        platformProductId: String(p.id),
      },
    },
    update: {
      name: p.title,
      description: p.body_html ?? "",
      price,
      images,
      variants: p.variants,
      stockStatus,
      category: p.product_type || null,
    },
    create: {
      merchantId,
      platformProductId: String(p.id),
      name: p.title,
      description: p.body_html ?? "",
      price,
      currency: "DZD",
      images,
      variants: p.variants,
      stockStatus,
      category: p.product_type || null,
    },
  });
};

export interface ProductsSyncedEvent {
  merchantId: string;
  count: number;
}

export const emitProductsSynced = (data: ProductsSyncedEvent) => {
  eventBus.emit("products.synced", data);
};

export const onProductsSynced = (listener: (data: ProductsSyncedEvent) => void) => {
  eventBus.on("products.synced", listener);
};

export const offProductsSynced = (listener: (data: ProductsSyncedEvent) => void) => {
  eventBus.off("products.synced", listener);
};
