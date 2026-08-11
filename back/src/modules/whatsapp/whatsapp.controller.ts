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
import { enqueueMessageJob } from "../../queues/message.queue";
import { transcribeAudio } from "../ai/media/transcription.service";
import { captionImage } from "../ai/media/imageCaption.service";

const MEDIA_DIR = path.resolve("/app/uploads/media");

function ensureMediaDir() {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }
}

function mimeToExt(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
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
  return map[base] || ".bin";
}

function mapWaType(type: string): string {
  const map: Record<string, string> = {
    text: "text",
    image: "image",
    video: "video",
    audio: "audio",
    voice: "audio",     // OpenWA neutral type for voice notes (ptt)
    ptt: "audio",       // WhatsApp voice messages (push-to-talk)
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

        let conversation: Awaited<ReturnType<typeof conversationService.findOrCreateByCustomer>> | null =
          await conversationService.getByPhone(
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
        let rawPayload: Record<string, unknown> | undefined;
        let filePath: string | undefined;
        let messageType: "text" | "voice" | "image" = "text";

        const media = data.media as
          | { mimetype?: string; data?: string; omitted?: boolean }
          | undefined;

        if (media) {
          console.log(`[WhatsApp] Media: mimetype=${media.mimetype} omitted=${media.omitted} hasData=${!!media.data}`);
        }

        if (media?.data && media.mimetype && !media.omitted) {
          ensureMediaDir();
          const ext = mimeToExt(media.mimetype);
          const filename = `${conversation.id}-${Date.now()}${ext}`;
          const fullPath = path.join(MEDIA_DIR, filename);
          fs.writeFileSync(fullPath, Buffer.from(media.data, "base64"));
          mediaUrl = `/uploads/media/${filename}`;
          mimeType = media.mimetype;
          filePath = mediaUrl;

          // Prefer the media mimetype over data.type — OpenWA sometimes reports
          // voice notes as type="voice"/"text" even though the media is audio.
          const baseMime = media.mimetype.split(";")[0].trim().toLowerCase();
          if (baseMime.startsWith("audio/")) {
            messageType = "voice";
          } else if (baseMime.startsWith("image/")) {
            messageType = "image";
          } else if (msgType === "audio") {
            messageType = "voice";
          } else if (msgType === "image") {
            messageType = "image";
          }
        }

        // Use body if present, otherwise use a placeholder for media messages
        let content = body || (msgType === "text" ? "" : `[${msgType} message]`);

        const savedMessage = await conversationService.addMessage(conversation.id, "customer", content, {
          contentType: msgType,
          mediaUrl,
          mimeType,
          rawPayload,
          messageType,
          filePath,
          createdAt,
        });

        console.log(`[WhatsApp] Message saved to conversation ${conversation.id} (type=${messageType})`);

        // ─── Voice: transcribe via Gemini, update content ──────────────
        if (messageType === "voice" && filePath) {
          const fullPath = path.resolve("/app", filePath.slice(1)); // strip leading /
          try {
            const transcript = await transcribeAudio(fullPath, mimeType!);
            await prisma.message.update({
              where: { id: savedMessage.id },
              data: { content: transcript, text: transcript },
            });
            content = transcript;
            console.log(`[WhatsApp] Voice transcribed: "${transcript.substring(0, 80)}"`);
          } catch (err) {
            console.error("[WhatsApp] Voice transcription failed:", err);
            const fallback = "[voice message - transcription failed]";
            await prisma.message.update({
              where: { id: savedMessage.id },
              data: { content: fallback, text: fallback },
            });
            content = fallback;
          }
        }

        // ─── Image: caption via Gemini, update content + entities ─────
        if (messageType === "image" && filePath) {
          const fullPath = path.resolve("/app", filePath.slice(1));
          try {
            const result = await captionImage(fullPath, mimeType!);
            await prisma.message.update({
              where: { id: savedMessage.id },
              data: {
                content: result.description,
                text: result.description,
                entities: {
                  imageCategory: result.category,
                  productName: result.productName,
                } as any,
              },
            });
            content = result.description;
            console.log(`[WhatsApp] Image captioned: category=${result.category}, product=${result.productName ?? "none"}`);
          } catch (err) {
            console.error("[WhatsApp] Image captioning failed:", err);
            const fallback = "[image - could not process]";
            await prisma.message.update({
              where: { id: savedMessage.id },
              data: { content: fallback, text: fallback },
            });
            content = fallback;
          }
        }

        enqueueMessageJob(savedMessage.id).catch((err) => {
          console.error(`[WhatsApp] Failed to enqueue message ${savedMessage.id} for agent:`, err);
        });

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
            const remote = await openwaService.getSession(sessionId);
            if (remote.phone && waSession?.phoneNumber !== remote.phone) {
              await prisma.whatsAppSession.updateMany({
                where: { sessionId },
                data: { phoneNumber: remote.phone },
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
      const stale = all.find((s) => s.name.startsWith(merchantId));
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

    const session = await openwaService.createSession(`${merchantId}-${Date.now()}`);
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
      },
    });

    notificationService.emitSessionStatus({
      merchantId,
      status: sessionStatus,
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
      return res.json({ status: "disconnected", hasSession: false });
    }

    let currentStatus = waSession.status;

    try {
      const remote = await openwaService.getSession(waSession.sessionId);
      const updates: any = {};
      if (remote.status !== currentStatus) {
        updates.status = remote.status;
        currentStatus = remote.status;
      }
      if (remote.status === "ready" && remote.phone && remote.phone !== waSession.phoneNumber) {
        updates.phoneNumber = remote.phone;
      }
      if (Object.keys(updates).length > 0) {
        await prisma.whatsAppSession.update({
          where: { id: waSession.id },
          data: updates,
        });
        if (updates.phoneNumber) waSession.phoneNumber = updates.phoneNumber;
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
      hasSession: true,
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
      await openwaService.logoutSession(waSession.sessionId);
    } catch {}
    try {
      await openwaService.deleteSession(waSession.sessionId);
    } catch {}

    await prisma.whatsAppSession.delete({ where: { id: waSession.id } });

    notificationService.emitSessionStatus({
      merchantId,
      status: "disconnected",
    });

    return res.json({ message: "Session deleted" });
  } catch (err) {
    next(err);
  }
}

export async function disconnectSession(
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
      await openwaService.stopSession(waSession.sessionId);
    } catch {}

    await prisma.whatsAppSession.update({
      where: { id: waSession.id },
      data: { status: "disconnected" },
    });

    notificationService.emitSessionStatus({
      merchantId,
      status: "disconnected",
    });

    return res.json({ message: "Session disconnected" });
  } catch (err) {
    next(err);
  }
}

export async function reconnectSession(
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
      await openwaService.startSession(waSession.sessionId);
    } catch {}

    return res.json({ status: "connecting" });
  } catch (err) {
    next(err);
  }
}

export async function requestPairingCode(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const merchantId = req.merchant!.merchantId;
    const { phoneNumber } = req.body as { phoneNumber?: string };

    if (!phoneNumber) {
      return res.status(400).json({ message: "phoneNumber is required" });
    }

    const existing = await prisma.whatsAppSession.findUnique({
      where: { merchantId },
    });

    let sessionId: string;

    if (existing) {
      try { await openwaService.stopSession(existing.sessionId); } catch {}
      try { await openwaService.logoutSession(existing.sessionId); } catch {}
      try { await openwaService.deleteSession(existing.sessionId); } catch {}
      await prisma.whatsAppSession.delete({ where: { id: existing.id } });
    }

    try {
      const all = await openwaService.listSessions();
      const stale = all.find((s) => s.name.startsWith(merchantId));
      if (stale) {
        try { await openwaService.stopSession(stale.id); } catch {}
        try { await openwaService.logoutSession(stale.id); } catch {}
        await openwaService.deleteSession(stale.id);
      }
    } catch {}

    const session = await openwaService.createSession(`${merchantId}-${Date.now()}`);
    await openwaService.startSession(session.id);
    sessionId = session.id;

    await new Promise((r) => setTimeout(r, 3000));

    const code = await openwaService.getPairingCode(sessionId, phoneNumber);

    const webhookUrl = `${config.internalUrl.replace(/\/+$/, "")}/whatsapp/webhook`;
    await openwaService.registerWebhook(
      sessionId,
      webhookUrl,
      WEBHOOK_EVENTS,
      config.openwaWebhookSecret,
    );

    await prisma.whatsAppSession.create({
      data: {
        merchantId,
        sessionId,
        status: "connecting",
        phoneNumber,
      },
    });

    notificationService.emitSessionStatus({
      merchantId,
      status: "connecting",
      phoneNumber,
    });

    return res.status(201).json({ code, sessionId });
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

  // Load merchant templates from AgentConfig
  const agentConfig = await prisma.agentConfig.findUnique({
    where: { merchantId },
  });

  const templates = (agentConfig?.templates as Record<string, string> | null) ?? {};
  const shopifyConnection = await prisma.shopifyConnection.findFirst({
    where: { storeConnection: { merchantId } },
  });

  const template =
    templates.orderConfirmation ||
    [
      "Bonjour {clientName},",
      "",
      "Votre commande #{orderId} pour \"{productName}\" a bien été reçue.",
      "",
      "Montant: {totalAmount} DA",
      "Wilaya: {wilaya}",
      "",
      "Merci pour votre confiance !",
    ].join("\n");

  const text = template
    .replace(/\{clientName\}/g, customerName || "Client")
    .replace(/\{orderId\}/g, platformOrderId)
    .replace(/\{productName\}/g, productName)
    .replace(/\{totalAmount\}/g, totalAmount.toLocaleString("fr-FR"))
    .replace(/\{wilaya\}/g, wilaya);

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

export async function sendDeliveryStatusNotification(order: {
  orderId: string;
  merchantId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  platformOrderId: string;
  totalAmount: number;
  wilaya: string;
  trackingNumber: string;
  status: "shipped" | "delivered";
  provider: string;
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
    orderId,
    trackingNumber,
    status,
    provider,
  } = order;

  if (!customerPhone) {
    console.log(
      `[WhatsApp] Skipping delivery status — no phone for order ${platformOrderId}`,
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
      `[WhatsApp] Skipping delivery status — WhatsApp not connected for merchant ${merchantId}`,
    );
    return;
  }

  const conversation = await conversationService.createFromOrder(
    merchantId,
    orderId,
    customerId,
    customerPhone,
  );

  const agentConfig = await prisma.agentConfig.findUnique({
    where: { merchantId },
  });
  const templates = (agentConfig?.templates as Record<string, string> | null) ?? {};

  const isShipped = status === "shipped";
  const template =
    (isShipped
      ? templates.deliveryShipped
      : templates.deliveryDelivered) ||
    (isShipped
      ? [
          "Bonjour {clientName},",
          "",
          "Votre commande #{orderId} pour \"{productName}\" a été expédiée !",
          "",
          "Suivi: {trackingNumber} ({provider})",
          "",
          "Merci de votre confiance !",
        ].join("\n")
      : [
          "Bonjour {clientName},",
          "",
          "Votre commande #{orderId} pour \"{productName}\" a été livrée.",
          "",
          "Merci pour votre achat !",
        ].join("\n"));

  const text = template
    .replace(/\{clientName\}/g, customerName || "Client")
    .replace(/\{orderId\}/g, platformOrderId)
    .replace(/\{productName\}/g, productName)
    .replace(/\{trackingNumber\}/g, trackingNumber)
    .replace(/\{provider\}/g, provider)
    .replace(/\{totalAmount\}/g, totalAmount.toLocaleString("fr-FR"))
    .replace(/\{wilaya\}/g, wilaya);

  try {
    await openwaService.sendText(waSession.sessionId, customerPhone, text);
    await conversationService.addMessage(conversation.id, "agent", text);
    console.log(
      `[WhatsApp] Delivery status "${status}" sent for order ${platformOrderId}`,
    );
  } catch (err) {
    console.error(
      `[WhatsApp] Failed to send delivery status for ${platformOrderId}:`,
      err,
    );
  }
}