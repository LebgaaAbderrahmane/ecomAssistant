import { Response } from "express";
import { getCustomers } from "./customers.service";
import { AuthenticatedRequest } from "../../middlwares/auth.middlware";

export const listCustomers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.merchant!.merchantId;
    const { cursor, limit, search } = req.query as {
      cursor?: string;
      limit?: string;
      search?: string;
    };

    const result = await getCustomers({ merchantId, cursor, limit, search });
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("[Customers] listCustomers error:", err.message || err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};
