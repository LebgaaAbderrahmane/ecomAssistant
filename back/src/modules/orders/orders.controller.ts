import { Request, Response } from 'express';
import { getOrders, bulkUpdateStatus, bulkHoldAgent, bulkUpdateTracking, listOrderIds } from './orders.service';
import { GetOrdersQuery } from '../../validators/order.validator';
import { AuthenticatedRequest } from '../../middlwares/auth.middlware';
import { ingestOrder } from './orders.service';


export const listOrders = async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.merchant!.merchantId;

  const { cursor, limit, status, search, storeConnectionId } = req.query as unknown as GetOrdersQuery;

  const result = await getOrders({
    merchantId,
    cursor,
    limit,
    status,
    search,
    storeConnectionId,
  });

  return res.status(200).json(result);
};

export const postFakeOrder = async (req: Request, res: Response) => {
  const order = req.body;
  const result = await ingestOrder(order);
  return res.status(202).json(result);
};

export const patchBulkStatus = async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.merchant!.merchantId;
  const { orderIds, status } = req.body;

  if (!Array.isArray(orderIds) || orderIds.length === 0 || !status) {
    res.status(400).json({ error: 'orderIds (array) and status are required' });
    return;
  }

  const count = await bulkUpdateStatus(merchantId, orderIds, status);
  res.json({ count });
};

export const patchBulkHold = async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.merchant!.merchantId;
  const { orderIds, hold } = req.body;

  if (!Array.isArray(orderIds) || orderIds.length === 0 || typeof hold !== 'boolean') {
    res.status(400).json({ error: 'orderIds (array) and hold (boolean) are required' });
    return;
  }

  const count = await bulkHoldAgent(merchantId, orderIds, hold);
  res.json({ count });
};

export const patchBulkTracking = async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.merchant!.merchantId;
  const { orderIds, trackingNumber, deliveryProvider } = req.body;

  if (!Array.isArray(orderIds) || orderIds.length === 0 || !trackingNumber || !deliveryProvider) {
    res.status(400).json({ error: 'orderIds (array), trackingNumber, and deliveryProvider are required' });
    return;
  }

  const count = await bulkUpdateTracking(merchantId, orderIds, trackingNumber, deliveryProvider);
  res.json({ count });
};

export const getOrderIds = async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.merchant!.merchantId;
  const { status, search } = req.query as { status?: string; search?: string };

  const ids = await listOrderIds(merchantId, status, search);
  res.json({ ids });
};