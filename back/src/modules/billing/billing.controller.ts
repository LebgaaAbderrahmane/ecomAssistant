import { Response, Request } from "express";
import { billingService } from "./billing.service";
import { AuthenticatedRequest } from "../../middlwares/auth.middlware";
import type { BillingInput } from "../../validators/billing.validator";

export const connect = async (req: Request, res: Response) => {
  console.log("[Payments] Webhook received:", req.body);
  res.sendStatus(200);
};

export const createCheckout = async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.merchant!.merchantId;
  const { plan } = req.body as BillingInput;

  const result = await billingService.createCheckout(merchantId, plan);
  res.json(result);
};

export const paymentSuccess = async (_req: Request, res: Response) => {
  res.json({ status: "success" });
};

export const paymentFailure = async (_req: Request, res: Response) => {
  res.json({ status: "failed" });
};
