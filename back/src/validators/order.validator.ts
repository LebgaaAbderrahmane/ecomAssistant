// src/modules/order/order.validator.ts
import { z } from 'zod';

export const getOrdersSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  storeConnectionId: z.string().optional(),
});

export type GetOrdersQuery = z.infer<typeof getOrdersSchema>;