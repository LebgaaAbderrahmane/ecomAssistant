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
  const order = req.body;
  const result = await ingestOrder(order);
  return res.status(202).json(result);
};