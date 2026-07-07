import prisma from "../../config/db.config";
import { PaginatedResult } from "../../types/pagination.types";

interface GetCustomersParams {
  merchantId: string;
  cursor?: string;
  limit?: number | string;
  search?: string;
  orderFilter?: string;
}

const encodeCursor = (createdAt: Date, id: string): string =>
  Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString("base64url");

const decodeCursor = (cursor: string): { createdAt: Date; id: string } => {
  const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  return { createdAt: new Date(decoded.createdAt), id: decoded.id };
};

export const getCustomers = async (
  params: GetCustomersParams,
): Promise<PaginatedResult<any>> => {
  const { merchantId, cursor, search, orderFilter } = params;
  const limit = Math.min(Number(params.limit) || 20, 100);

  const where: any = { merchantId };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { phone: { contains: search } },
    ];
  }
  if (orderFilter === "with_orders") {
    where.orders = { _count: { gt: 0 } };
  } else if (orderFilter === "without_orders") {
    where.orders = { _count: 0 };
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

  const customers = await prisma.customer.findMany({
    where: { ...where, ...cursorWhere },
    include: {
      _count: { select: { orders: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasNextPage = customers.length > limit;
  if (hasNextPage) customers.pop();

  const nextCursor =
    hasNextPage
      ? encodeCursor(customers[customers.length - 1].createdAt, customers[customers.length - 1].id)
      : null;

  const prevCursor = decodedCursor
    ? encodeCursor(customers[0].createdAt, customers[0].id)
    : null;

  return {
    data: customers,
    pagination: {
      hasNextPage,
      hasPrevPage: !!cursor,
      nextCursor,
      prevCursor,
    },
  };
};
