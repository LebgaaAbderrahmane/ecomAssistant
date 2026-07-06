import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import prisma from "../../config/db.config";
import { redis } from "../../config";
import { config } from "../../config";
import { openwaService } from "./whatsapp.service";
import { conversationService } from "./conversation.service";
import { notificationService } from "./notification.service";
import { AuthenticatedRequest } from "../../middlwares/auth.middlware";

const MEDIA_DIR = path.resolve("/app/uploads/media");

function ensureMediaDir() {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "video/mp4": ".mp4",
    "video/3gpp": ".3gp",
    "application/pdf": ".pdf",
  };
  return map[mime] || ".bin";
}

function mapWaType(type: string): string {
  const map: Record<string, string> = {
    text: "text",
    image: "image",
    video: "video",
    audio: "audio",
    document: "document",
    sticker: "image",
  };
  return map[type] || "text";
}

const WEBHOOK_EVENTS = ["message.received", "session.status"];

function verifyHmac(payload: string, signatureHeader: string): boolean {
  if (!config.openwaWebhookSecret) return false;
  const computed = crypto
    .createHmac("sha256", config.openwaWebhookSecret)
    .update(payload)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(signatureHeader),
  );
}

function extractPhone(from: string): string {
  return from.replace(/@[a-z.]+$/g, "");
}

export async function handleWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!config.isDev) {
      const signature = req.headers["x-hub-signature-256"] as string;
      if (!signature || !verifyHmac(JSON.stringify(req.body), signature)) {
        return res.status(401).json({ message: "Invalid webhook signature" });
      }
    }

    const { event, sessionId, data } = req.body as {
      event: string;
      sessionId: string;
      data: Record<string, unknown>;
    };

    console.log(`[WhatsApp] Webhook received: event=${event} sessionId=${sessionId}`);

    switch (event) {
      case "message.received": {
        const from = data.from as string;
        const body = (data.body as string) || "";
        const phone = extractPhone(from);
        const msgType = mapWaType((data.type as string) || "text");
        const timestamp = data.timestamp as number | undefined;
        const createdAt = timestamp
          ? new Date(timestamp * 1000)
          : new Date();

        console.log(`[WhatsApp] Message from=${phone} type=${msgType} body="${body.substring(0, 80)}"`);

        const waSession = await prisma.whatsAppSession.findUnique({
          where: { sessionId },
        });
        if (!waSession) {
          console.log(`[WhatsApp] No WhatsAppSession for sessionId=${sessionId}, ignoring`);
          return res.status(200).json({ status: "ignored" });
        }

        let conversation = await conversationService.getByPhone(
          waSession.merchantId,
          phone,
        );
        if (!conversation) {
          const customer = await prisma.customer.findFirst({
            where: {
              merchantId: waSession.merchantId,
              phone: { in: [`+${phone}`, phone] },
            },
          });
          if (!customer) {
            console.log(`[WhatsApp] No customer found for phone=${phone}, ignoring`);
            return res.status(200).json({ status: "ignored" });
          }
          conversation = await conversationService.findOrCreateByCustomer(
            waSession.merchantId,
            customer.id,
            customer.phone,
          );
          console.log(`[WhatsApp] Auto-created conversation ${conversation.id} for customer ${customer.name}`);
        }

        let mediaUrl: string | undefined;
        let mimeType: string | undefined;

        const media = data.media as
          | { mimetype?: string; data?: string; omitted?: boolean }
          | undefined;

        if (media?.data && media.mimetype && !media.omitted) {
          ensureMediaDir();
          const ext = mimeToExt(media.mimetype);
          const filename = `${conversation.id}-${Date.now()}${ext}`;
          const filePath = path.join(MEDIA_DIR, filename);
          fs.writeFileSync(filePath, Buffer.from(media.data, "base64"));
          mediaUrl = `/uploads/media/${filename}`;
          mimeType = media.mimetype;
        }

        const content = body || (msgType === "text" ? "" : msgType);

        await conversationService.addMessage(conversation.id, "customer", content, {
          contentType: msgType,
          mediaUrl,
          mimeType,
          createdAt,
        });

        console.log(`[WhatsApp] Message saved to conversation ${conversation.id}`);
        return res.status(200).json({ status: "received" });
      }

      case "session.status": {
        const rawStatus = data.status as string;
        const status = rawStatus === "ready" ? "connected" : rawStatus;

        const waSession = await prisma.whatsAppSession.findUnique({
          where: { sessionId },
        });

        const previousStatus = waSession?.status;

        await prisma.whatsAppSession.updateMany({
          where: { sessionId },
          data: { status },
        });

        if (status === "connected") {
          try {
            const session = await openwaService.getSession(sessionId);
            if (waSession?.phoneNumber !== session.name) {
              await prisma.whatsAppSession.update({
                where: { sessionId },
                data: { phoneNumber: session.name },
              });
            }
          } catch {
            // phone number is optional, ignore failures
          }
        }

        if (waSession) {
          notificationService.emitSessionStatus({
            merchantId: waSession.merchantId,
            status,
            phoneNumber: waSession.phoneNumber ?? undefined,
          });

          if (previousStatus !== "disconnected" && status === "disconnected") {
            await notificationService.createNotification(
              waSession.merchantId,
              "whatsapp_disconnected",
              "WhatsApp Déconnecté",
              "Votre session WhatsApp a été déconnectée. Reconnectez-la pour continuer à recevoir des messages.",
              "/dashboard/settings?tab=whatsapp",
            );
          } else if (previousStatus === "disconnected" && status === "connected") {
            await notificationService.createNotification(
              waSession.merchantId,
              "whatsapp_reconnected",
              "WhatsApp Reconnecté",
              "Votre session WhatsApp est de nouveau connectée.",
            );
          }
        }

        return res.status(200).json({ status: "ok" });
      }

      default:
        return res.status(200).json({ status: "ignored" });
    }
  } catch (err) {
    next(err);
  }
}

export async function createSession(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const merchantId = req.merchant!.merchantId;

    const existing = await prisma.whatsAppSession.findUnique({
      where: { merchantId },
    });
    if (existing) {
      try {
        await openwaService.stopSession(existing.sessionId);
      } catch {}
      try {
        await openwaService.logoutSession(existing.sessionId);
      } catch {}
      try {
        await openwaService.deleteSession(existing.sessionId);
      } catch {}
      await prisma.whatsAppSession.delete({ where: { id: existing.id } });
    }

    try {
      const all = await openwaService.listSessions();
      const stale = all.find((s) => s.name === merchantId);
      if (stale) {
        try {
          await openwaService.stopSession(stale.id);
        } catch {}
        try {
          await openwaService.logoutSession(stale.id);
        } catch {}
        await openwaService.deleteSession(stale.id);
      }
    } catch {
      // best-effort cleanup
    }

    const session = await openwaService.createSession(merchantId);
    await openwaService.startSession(session.id);

    let qr: string | null = null;
    let sessionReady = false;

    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        qr = await openwaService.getQR(session.id);
        if (qr) break;
      } catch {
        // QR not ready yet, retry
      }
      try {
        const status = await openwaService.getSession(session.id);
        if (status.status === "ready" || status.status === "connected") {
          sessionReady = true;
          break;
        }
      } catch {
        // session not ready yet
      }
    }

    if (!qr && !sessionReady) {
      return res.status(502).json({ message: "QR code generation timeout" });
    }

    const webhookUrl = `${config.internalUrl.replace(/\/+$/, "")}/whatsapp/webhook`;
    await openwaService.registerWebhook(
      session.id,
      webhookUrl,
      WEBHOOK_EVENTS,
      config.openwaWebhookSecret,
    );

    const sessionStatus = sessionReady ? "connected" : "connecting";
    await prisma.whatsAppSession.create({
      data: {
        merchantId,
        sessionId: session.id,
        status: sessionStatus,
        phoneNumber: session.name,
      },
    });

    notificationService.emitSessionStatus({
      merchantId,
      status: sessionStatus,
      phoneNumber: session.name,
    });

    if (qr) {
      const rawQr = qr.replace(/^data:image\/png;base64,/, "");
      const qrKey = `whatsapp:qr:${merchantId}`;
      await redis.set(qrKey, rawQr, { EX: 300 });
      return res.status(201).json({ qrBase64: rawQr });
    }

    return res.status(201).json({ connected: true });
  } catch (err) {
    next(err);
  }
}

export async function getSessionStatus(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const merchantId = req.merchant!.merchantId;

    const waSession = await prisma.whatsAppSession.findUnique({
      where: { merchantId },
    });
    if (!waSession) {
      return res.json({ status: "disconnected" });
    }

    let currentStatus = waSession.status;

    try {
      const remote = await openwaService.getSession(waSession.sessionId);
      if (remote.status !== currentStatus) {
        await prisma.whatsAppSession.update({
          where: { id: waSession.id },
          data: { status: remote.status },
        });
        currentStatus = remote.status;
      }
    } catch {
      currentStatus = "disconnected";
      await prisma.whatsAppSession.update({
        where: { id: waSession.id },
        data: { status: "disconnected" },
      });
    }

    return res.json({
      status: currentStatus === "ready" ? "connected" : currentStatus,
      phoneNumber: waSession.phoneNumber,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteSession(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const merchantId = req.merchant!.merchantId;

    const waSession = await prisma.whatsAppSession.findUnique({
      where: { merchantId },
    });
    if (!waSession) {
      return res.status(404).json({ message: "No session found" });
    }

    try {
      const webhooks = await openwaService.listWebhooks(waSession.sessionId);
      for (const wh of webhooks) {
        await openwaService.deleteWebhook(waSession.sessionId, wh.id);
      }
    } catch {
      // best-effort cleanup
    }

    try {
      await openwaService.deleteSession(waSession.sessionId);
    } catch {
      // session may already be gone
    }

    await prisma.whatsAppSession.delete({ where: { id: waSession.id } });

    return res.json({ message: "Session deleted" });
  } catch (err) {
    next(err);
  }
}

export async function sendOrderNotification(order: {
  id: string;
  merchantId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  platformOrderId: string;
  totalAmount: number;
  wilaya: string;
}): Promise<void> {
  const {
    merchantId,
    customerPhone,
    customerName,
    customerId,
    productName,
    platformOrderId,
    totalAmount,
    wilaya,
    id: orderId,
  } = order;

  if (!customerPhone) {
    console.log(
      `[WhatsApp] Skipping notification — no phone for order ${platformOrderId}`,
    );
    return;
  }

  const waSession = await prisma.whatsAppSession.findUnique({
    where: { merchantId },
  });
  if (
    !waSession ||
    (waSession.status !== "connected" && waSession.status !== "ready")
  ) {
    console.log(
      `[WhatsApp] Skipping notification — WhatsApp not connected for merchant ${merchantId}`,
    );
    return;
  }

  const conversation = await conversationService.createFromOrder(
    merchantId,
    orderId,
    customerId,
    customerPhone,
  );

  const text = [
    `Bonjour ${customerName},`,
    "",
    `Votre commande #${platformOrderId} pour "${productName}" a bien été reçue.`,
    "",
    `Montant: ${totalAmount.toLocaleString("fr-FR")} DA`,
    `Wilaya: ${wilaya}`,
    "",
    "Merci pour votre confiance !",
  ].join("\n");

  try {
    await openwaService.sendText(waSession.sessionId, customerPhone, text);
    await conversationService.addMessage(conversation.id, "agent", text);
    console.log(
      `[WhatsApp] Order confirmation sent for order ${platformOrderId}`,
    );
  } catch (err) {
    console.error(
      `[WhatsApp] Failed to send order confirmation for ${platformOrderId}:`,
      err,
    );
  }
}
