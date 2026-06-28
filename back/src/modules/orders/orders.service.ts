// src/modules/order/order.service.ts
import prisma  from '../../config/db.config';
import { PaginatedResult } from '../../types/pagination.types';
import { Order } from '@prisma/client';

interface GetOrdersParams {
  merchantId: string;
  cursor?: string;
  limit?: number | string; 
  status?: string;
  storeConnectionId?: string;
}

// Cursor shape: { createdAt: ISO string, id: string }
const encodeCursor = (createdAt: Date, id: string): string =>
  Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString('base64url');

const decodeCursor = (cursor: string): { createdAt: Date; id: string } => {
  const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  return { createdAt: new Date(decoded.createdAt), id: decoded.id };
};

export const getOrders = async (
  params: GetOrdersParams
): Promise<PaginatedResult<Order>> => {
  const { merchantId, cursor, status, storeConnectionId } = params;
  const limit = Math.min(Number(params.limit) || 20, 100);  
  const where = {
    merchantId,
    ...(status && { status }),
    // storeConnectionId is not on Order directly — filter via product or skip if not needed
  };

  let cursorWhere = {};
  let decodedCursor: { createdAt: Date; id: string } | null = null;

  if (cursor) {
    decodedCursor = decodeCursor(cursor);
    // Rows that come after (createdAt DESC, id DESC):
    // either createdAt is older, or same createdAt with smaller id
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

  const orders = await prisma.order.findMany({
    where: { ...where, ...cursorWhere },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasNextPage = orders.length > limit;
  if (hasNextPage) orders.pop();

  const nextCursor =
    hasNextPage ? encodeCursor(orders[orders.length - 1].createdAt, orders[orders.length - 1].id) : null;

  const prevCursor = decodedCursor
    ? encodeCursor(orders[0].createdAt, orders[0].id)
    : null;

  return {
    data: orders,
    pagination: {
      hasNextPage,
      hasPrevPage: !!cursor,
      nextCursor,
      prevCursor,
    },
  };
};