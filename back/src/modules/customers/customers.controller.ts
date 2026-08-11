import { Response } from "express";
import { getCustomers, listCustomerIds, bulkBlockCustomers } from "./customers.service";
import { AuthenticatedRequest } from "../../middlwares/auth.middlware";

export const listCustomers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.merchant!.merchantId;
    const { cursor, limit, search, orderFilter } = req.query as {
      cursor?: string;
      limit?: string;
      search?: string;
      orderFilter?: string;
    };

    const result = await getCustomers({ merchantId, cursor, limit, search, orderFilter });
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("[Customers] listCustomers error:", err.message || err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};

export const getCustomerIds = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.merchant!.merchantId;
    const { search, orderFilter } = req.query as { search?: string; orderFilter?: string };

    const ids = await listCustomerIds(merchantId, search, orderFilter);
    res.json({ ids });
  } catch (err: any) {
    console.error("[Customers] getCustomerIds error:", err.message || err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};

export const patchBulkBlock = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.merchant!.merchantId;
    const { customerIds, blocked } = req.body;

    if (!Array.isArray(customerIds) || customerIds.length === 0 || typeof blocked !== "boolean") {
      res.status(400).json({ error: "customerIds (array) and blocked (boolean) are required" });
      return;
    }

    const count = await bulkBlockCustomers(merchantId, customerIds, blocked);
    res.json({ count });
  } catch (err: any) {
    console.error("[Customers] patchBulkBlock error:", err.message || err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};
