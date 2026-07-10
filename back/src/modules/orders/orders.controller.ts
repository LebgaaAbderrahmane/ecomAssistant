import { Request, Response } from 'express';
import { getOrders } from './orders.service';
import { GetOrdersQuery } from '../../validators/order.validator';
import { AuthenticatedRequest } from '../../middlwares/auth.middlware';
import { ingestOrder } from './orders.service';


export const listOrders = async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.merchant!.merchantId; // ✅ matches your middleware shape

  const { cursor, limit, status, storeConnectionId } = req.query as unknown as GetOrdersQuery;

  const result = await getOrders({
    merchantId,
    cursor,
    limit,
    status,
    storeConnectionId,
  });

  return res.status(200).json(result);
};

export const postFakeOrder = async (req: Request, res: Response) => {
  try {
    const order = req.body;
    const result = await ingestOrder(order);
    return res.status(202).json(result);
  } catch (err: any) {
    console.error('[orders] Failed to ingest order:', err.message || err);
    return res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
  }
};