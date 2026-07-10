// src/modules/order/order.service.ts
import prisma  from '../../config/db.config';
import { PaginatedResult } from '../../types/pagination.types';
import { Order } from '@prisma/client';
import { enqueueOrderJob } from '../../queues/order.queue';
import { FakeOrderInput } from '../../validators/order.validator';
import eventBus from '../../events/eventBus';

interface GetOrdersParams {
  merchantId: string;
  cursor?: string;
  limit?: number | string; 
  status?: string;
  search?: string;
  dateRange?: string;
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
  const { merchantId, cursor, status, search, dateRange } = params;
  const limit = Math.min(Number(params.limit) || 20, 100);  
  const where: any = {
    merchantId,
    ...(status && { status: { in: status.split(',') } }),
  };
  if (search) {
    where.OR = [
      { customer: { name: { contains: search, mode: 'insensitive' } } },
      { customer: { phone: { contains: search } } },
      { productName: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (dateRange) {
    const now = new Date();
    let start: Date;
    switch (dateRange) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week': {
        start = new Date(now);
        const day = start.getDay();
        const diff = day === 0 ? 6 : day - 1;
        start.setDate(start.getDate() - diff);
        start.setHours(0, 0, 0, 0);
        break;
      }
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        start = null;
    }
    if (start) where.createdAt = { gte: start };
  }

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

  const [rawOrders, total] = await Promise.all([
    prisma.order.findMany({
      where: { ...where, ...cursorWhere },
      include: { customer: true, conversation: { select: { takenOverByHuman: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    }),
    prisma.order.count({ where }),
  ]);

  const orders = rawOrders.map((o) => ({
    ...o,
    customerName: o.customer?.name ?? '',
    customerPhone: o.customer?.phone ?? '',
  }));

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
      total,
      hasNextPage,
      hasPrevPage: !!cursor,
      nextCursor,
      prevCursor,
    },
  };
};

export const ingestOrder = async (input: FakeOrderInput) => {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, merchantId: input.merchantId },
  });
  if (!product) {
    throw new Error(`Product ${input.productId} not found for merchant ${input.merchantId}`);
  }

  const customer = await prisma.customer.upsert({
    where: { merchantId_phone: { merchantId: input.merchantId, phone: input.customerPhone } },
    update: { name: input.customerName },
    create: { merchantId: input.merchantId, phone: input.customerPhone, name: input.customerName },
  });

  // Backend computes delivery cost and total — never trust a client-supplied
  // amount for a COD order, even a simulated one. Falls back to 0 with a
  // warning if the merchant hasn't configured this wilaya yet, rather than
  // blocking order creation entirely.
  const deliveryCost = await prisma.wilayaDeliveryCost.findFirst({
    where: { merchantId: input.merchantId, wilaya: { equals: input.wilaya, mode: 'insensitive' } },
  });
  if (!deliveryCost) {
    console.warn(`[orders] no delivery cost configured for wilaya "${input.wilaya}" — defaulting to 0`);
  }
  const deliveryCostValue = deliveryCost?.cost ?? 0;
  const totalAmount = product.price * input.quantity + deliveryCostValue;

  const platformOrderId = input.platformOrderId ?? `FAKE-${Date.now()}`;

  const order = await prisma.order.create({
    data: {
      merchantId: input.merchantId,
      customerId: customer.id,
      platformOrderId,
      wilaya: input.wilaya,
      commune: input.commune,
      address: input.address,
      productId: product.id,
      productName: product.name, // snapshot at order time — product name/price can change later
      quantity: input.quantity,
      totalAmount,
      deliveryCost: deliveryCostValue,
    },
  });

  // TODO: duplicate of the conversation find-or-create logic in
  // fakeMessages.service.ts — collapse both onto conversation.service.ts's
  // helper once its exported function name is confirmed.
  const conversation =
    (await prisma.conversation.findFirst({
      where: { merchantId: input.merchantId, customerId: customer.id, state: { notIn: ['FINISHED', 'CANCELLED'] } },
    })) ??
    (await prisma.conversation.create({
      data: { merchantId: input.merchantId, customerId: customer.id },
    }));

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { currentOrderId: order.id, state: 'WAITING_CONFIRMATION' },
  });

  await enqueueOrderJob(order.id);

  return { orderId: order.id, conversationId: conversation.id };
};

export interface OrderCreatedEvent {
  merchantId: string;
  orderId: string;
}

export const emitOrderCreated = (data: OrderCreatedEvent) => {
  eventBus.emit("order.created", data);
};

export const onOrderCreated = (listener: (data: OrderCreatedEvent) => void) => {
  eventBus.on("order.created", listener);
};

export const offOrderCreated = (listener: (data: OrderCreatedEvent) => void) => {
  eventBus.off("order.created", listener);
};

export const bulkUpdateStatus = async (
  merchantId: string,
  orderIds: string[],
  status: string,
): Promise<number> => {
  const result = await prisma.order.updateMany({
    where: { merchantId, id: { in: orderIds } },
    data: { status: status as any },
  });
  return result.count;
};

export const bulkHoldAgent = async (
  merchantId: string,
  orderIds: string[],
  hold: boolean,
): Promise<number> => {
  const result = await prisma.conversation.updateMany({
    where: { merchantId, currentOrderId: { in: orderIds } },
    data: { takenOverByHuman: hold },
  });
  return result.count;
};

export const listOrderIds = async (
  merchantId: string,
  status?: string,
  search?: string,
  dateRange?: string,
): Promise<string[]> => {
  const where: any = {
    merchantId,
    ...(status && { status: { in: status.split(',') } }),
  };
  if (search) {
    where.OR = [
      { customer: { name: { contains: search, mode: 'insensitive' } } },
      { customer: { phone: { contains: search } } },
      { productName: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (dateRange) {
    const now = new Date();
    let start: Date | null = null;
    switch (dateRange) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week': {
        start = new Date(now);
        const day = start.getDay();
        const diff = day === 0 ? 6 : day - 1;
        start.setDate(start.getDate() - diff);
        start.setHours(0, 0, 0, 0);
        break;
      }
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
    }
    if (start) where.createdAt = { gte: start };
  }

  const orders = await prisma.order.findMany({
    where,
    select: { id: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  return orders.map(o => o.id);
};

export const bulkUpdateTracking = async (
  merchantId: string,
  orderIds: string[],
  trackingNumber: string,
  deliveryProvider: string,
): Promise<number> => {
  const result = await prisma.order.updateMany({
    where: { merchantId, id: { in: orderIds } },
    data: { trackingNumber, deliveryProvider },
  });
  return result.count;
};