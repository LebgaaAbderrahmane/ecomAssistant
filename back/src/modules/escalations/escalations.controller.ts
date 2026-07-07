import { Response } from "express";
import { getEscalations, resolveEscalation, resolveAllEscalations } from "./escalations.service";
import { AuthenticatedRequest } from "../../middlwares/auth.middlware";

export const listEscalations = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.merchant!.merchantId;
    const { cursor, limit } = req.query as { cursor?: string; limit?: string };

    const result = await getEscalations({ merchantId, cursor, limit });
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("[Escalations] listEscalations error:", err.message || err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};

export const resolve = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.merchant!.merchantId;
    const { id } = req.params;

    const updated = await resolveEscalation(id, merchantId);
    if (!updated) return res.status(404).json({ message: "Escalation not found" });

    return res.status(200).json({ message: "Escalation resolved" });
  } catch (err: any) {
    console.error("[Escalations] resolve error:", err.message || err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};

export const resolveAll = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.merchant!.merchantId;

    const result = await resolveAllEscalations(merchantId);
    return res.status(200).json({ message: "All escalations resolved", count: result.count });
  } catch (err: any) {
    console.error("[Escalations] resolveAll error:", err.message || err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};
