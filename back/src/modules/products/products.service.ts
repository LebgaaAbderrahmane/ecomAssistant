import prisma from "../../config/db.config";
import { PaginatedResult } from "../../types/pagination.types";
import type { Product } from "@prisma/client";

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
  if (stockStatus) where.stockStatus = stockStatus;
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

  const products = await prisma.product.findMany({
    where: { ...where, ...cursorWhere },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

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
      hasNextPage,
      hasPrevPage: !!cursor,
      nextCursor,
      prevCursor,
    },
  };
};
