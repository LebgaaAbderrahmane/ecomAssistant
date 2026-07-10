// src/modules/order/order.validator.ts
import { z } from 'zod';

export const getOrdersSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  search: z.string().optional(),
  dateRange: z.enum(['today', 'week', 'month', 'year']).optional(),
  storeConnectionId: z.string().optional(),
});

export type GetOrdersQuery = z.infer<typeof getOrdersSchema>;

export const FakeOrderSchema = z.object({
  merchantId: z.string(),
  customerPhone: z.string(),
  customerName: z.string().optional(),
  productId: z.string(),
  quantity: z.number().int().positive().default(1),
  wilaya: z.string().min(1),
  commune: z.string().optional(),
  address: z.string().min(1),
  platformOrderId: z.string().optional(), // auto-generated if omitted, for simulating Shopify's order id
});

export type FakeOrderInput = z.infer<typeof FakeOrderSchema>;