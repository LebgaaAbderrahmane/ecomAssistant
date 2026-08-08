import { Request, Response } from "express";
import prisma from "../../config/db.config";
import express,{ Router } from "express";
import * as controller from "./whatsapp.controller";
import { authenticate, AuthenticatedRequest } from "../../middlwares/auth.middlware";
import { notificationService } from "./notification.service";
import * as ordersService from "../orders/orders.service";
import * as productsService from "../products/products.service";

const router:Router = express.Router();

router.post("/webhook", controller.handleWebhook);
router.post("/session", authenticate, controller.createSession);
router.post("/session/pairing-code", authenticate, controller.requestPairingCode);
router.post("/session/disconnect", authenticate, controller.disconnectSession);
router.post("/session/reconnect", authenticate, controller.reconnectSession);
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

  const orderHandler = (data: { merchantId: string; orderId: string }) => {
    if (data.merchantId === merchantId) {
      res.write(`data: ${JSON.stringify({ type: "order.created", ...data })}\n\n`);
    }
  };
  ordersService.onOrderCreated(orderHandler);

  const productHandler = (data: { merchantId: string; count: number }) => {
    if (data.merchantId === merchantId) {
      res.write(`data: ${JSON.stringify({ type: "product.synced", ...data })}\n\n`);
    }
  };
  productsService.onProductsSynced(productHandler);

  prisma.whatsAppSession.findUnique({ where: { merchantId } }).then((waSession) => {
    res.write(`data: ${JSON.stringify({ type: "session.status", status: waSession?.status === "ready" ? "connected" : (waSession?.status ?? "disconnected"), phoneNumber: waSession?.phoneNumber ?? null })}\n\n`);
  }).catch(() => {
    res.write(`data: ${JSON.stringify({ type: "session.status", status: "disconnected", phoneNumber: null })}\n\n`);
  });

  req.on("close", () => {
    notificationService.offSessionStatus(statusHandler);
    notificationService.offNotificationCreated(notifHandler);
    ordersService.offOrderCreated(orderHandler);
    productsService.offProductsSynced(productHandler);
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
