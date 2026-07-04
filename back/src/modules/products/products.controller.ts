import { Response } from "express";
import { getProducts } from "./products.service";
import { AuthenticatedRequest } from "../../middlwares/auth.middlware";

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
