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

  const statusHandler = (data: { merchantId: string; status: string; phoneNumber?: string }) => {
    if (data.merchantId === merchantId) {
      res.write(`data: ${JSON.stringify({ type: "session.status", ...data })}\n\n`);
    }
  };

  const notifHandler = (data: { merchantId: string; notification: unknown }) => {
    if (data.merchantId === merchantId) {
      res.write(`data: ${JSON.stringify({ type: "notification", ...data })}\n\n`);
    }
  };

  notificationService.onSessionStatus(statusHandler);
  notificationService.onNotificationCreated(notifHandler);

  req.on("close", () => {
    notificationService.offSessionStatus(statusHandler);
    notificationService.offNotificationCreated(notifHandler);
  });
});

router.get("/notifications", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.merchant!.merchantId;
    const unreadOnly = req.query.unread === "true";
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await notificationService.list(merchantId, { unreadOnly, limit, offset });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

router.post("/notifications/:id/read", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.merchant!.merchantId;
    await notificationService.markAsRead(req.params.id, merchantId);
    return res.json({ message: "Marked as read" });
  } catch (err) {
    return res.status(500).json({ message: "Failed to mark as read" });
  }
});

router.post("/notifications/read-all", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.merchant!.merchantId;
    await notificationService.markAllAsRead(merchantId);
    return res.json({ message: "All marked as read" });
  } catch (err) {
    return res.status(500).json({ message: "Failed to mark all as read" });
  }
});

export default router;
