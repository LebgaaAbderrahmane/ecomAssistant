import { Router } from "express";
import { Request, Response } from "express";
import * as controller from "./whatsapp.controller";
import { authenticate, AuthenticatedRequest } from "../../middlwares/auth.middlware";
import { notificationService } from "./notification.service";

const router = Router();

router.post("/webhook", controller.handleWebhook);
router.post("/session", authenticate, controller.createSession);
router.get("/session/status", authenticate, controller.getSessionStatus);
router.delete("/session", authenticate, controller.deleteSession);

router.get("/events", authenticate, (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(": keepalive\n\n");

  const merchantId = req.merchant!.merchantId;

  const handler = (data: { merchantId: string; status: string; phoneNumber?: string }) => {
    if (data.merchantId === merchantId) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  notificationService.onSessionStatus(handler);

  req.on("close", () => {
    notificationService.offSessionStatus(handler);
  });
});

export default router;
