import { Response } from "express";
import { agentConfigService } from "./agent-config.service";
import { AuthenticatedRequest } from "../../middlwares/auth.middlware";

export async function getConfig(req: AuthenticatedRequest, res: Response) {
  const merchantId = req.merchant!.merchantId;
  const config = await agentConfigService.get(merchantId);
  res.json(config || {});
}

export async function saveConfig(req: AuthenticatedRequest, res: Response) {
  const merchantId = req.merchant!.merchantId;
  const { defaultLanguage, tone, followUpDelays, maxFollowUps, deliveryProvider } = req.body;
  const config = await agentConfigService.upsert(merchantId, {
    defaultLanguage,
    tone,
    followUpDelays,
    maxFollowUps,
    deliveryProvider,
  });
  res.json(config);
}

export async function activate(req: AuthenticatedRequest, res: Response) {
  const merchantId = req.merchant!.merchantId;
  await agentConfigService.activate(merchantId);
  res.json({ message: "Agent activated" });
}
