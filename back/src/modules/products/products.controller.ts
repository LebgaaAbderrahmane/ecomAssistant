import { Response } from "express";
import { getProducts, listProductIds, bulkToggleAgent } from "./products.service";
import { AuthenticatedRequest } from "../../middlwares/auth.middlware";
import { moduleLogger } from "../../lib/logger";

export const listProducts = async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.merchant!.merchantId;
  const { cursor, limit, search, stockStatus } = req.query as Record<string, string | undefined>;

  const result = await getProducts({
    merchantId,
    cursor,
    limit: limit ? parseInt(limit, 10) : undefined,
    search,
    stockStatus,
  });

  res.json(result);
};

export const getProductIds = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.merchant!.merchantId;
    const { search, stockStatus } = req.query as { search?: string; stockStatus?: string };

    const ids = await listProductIds(merchantId, search, stockStatus);
    res.json({ ids });
  } catch (err: any) {
    moduleLogger('products').error({ err: err.message || err }, 'getProductIds error');
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};

export const patchBulkAgent = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.merchant!.merchantId;
    const { productIds, agentEnabled } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0 || typeof agentEnabled !== "boolean") {
      res.status(400).json({ error: "productIds (array) and agentEnabled (boolean) are required" });
      return;
    }

    const count = await bulkToggleAgent(merchantId, productIds, agentEnabled);
    res.json({ count });
  } catch (err: any) {
    moduleLogger('products').error({ err: err.message || err }, 'patchBulkAgent error');
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};
