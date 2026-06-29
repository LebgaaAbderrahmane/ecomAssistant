import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import prisma from "../../config/db.config";
import { redis } from "../../config";
import { config } from "../../config";
import { openwaService } from "./whatsapp.service";
import { conversationService } from "./conversation.service";
import { AuthenticatedRequest } from "../../middlwares/auth.middlware";

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

    switch (event) {
      case "message.received": {
        const from = data.from as string;
        const body = data.body as string;
        const phone = extractPhone(from);

        const waSession = await prisma.whatsAppSession.findUnique({
          where: { sessionId },
        });
        if (!waSession) {
          return res.status(200).json({ status: "ignored" });
        }

        const conversation = await conversationService.getByPhone(
          waSession.merchantId,
          phone,
        );
        if (!conversation) {
          return res.status(200).json({ status: "ignored" });
        }

        await conversationService.addMessage(
          conversation.id,
          "customer",
          body,
        );

        return res.status(200).json({ status: "received" });
      }

      case "session.status": {
        const rawStatus = data.status as string;
        const status = rawStatus === "ready" ? "connected" : rawStatus;

        await prisma.whatsAppSession.updateMany({
          where: { sessionId },
          data: { status },
        });

        if (status === "connected") {
          try {
            const session = await openwaService.getSession(sessionId);
            const waSession = await prisma.whatsAppSession.findUnique({
              where: { sessionId },
            });
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
      return res.status(409).json({ message: "Session already exists" });
    }

    try {
      const all = await openwaService.listSessions();
      const stale = all.find(s => s.name === merchantId);
      if (stale) {
        try { await openwaService.stopSession(stale.id); } catch {}
        try { await openwaService.logoutSession(stale.id); } catch {}
        await openwaService.deleteSession(stale.id);
      }
    } catch {
      // best-effort cleanup
    }

    const session = await openwaService.createSession(merchantId);
    await openwaService.startSession(session.id);

    let qr: string | null = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        qr = await openwaService.getQR(session.id);
        if (qr) break;
      } catch {
        // QR not ready yet, retry
      }
    }
    if (!qr) {
      return res.status(502).json({ message: "QR code generation timeout" });
    }

    const rawQr = qr.replace(/^data:image\/png;base64,/, "");

    const webhookUrl = `${config.appUrl.replace(/\/+$/, "")}/whatsapp/webhook`;
    await openwaService.registerWebhook(
      session.id,
      webhookUrl,
      WEBHOOK_EVENTS,
      config.openwaWebhookSecret,
    );

    const qrKey = `whatsapp:qr:${merchantId}`;
    await redis.set(qrKey, rawQr, { EX: 300 });

    await prisma.whatsAppSession.create({
      data: {
        merchantId,
        sessionId: session.id,
        status: "connecting",
      },
    });

    return res.status(201).json({ qrBase64: rawQr });
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

export async function sendMessage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const merchantId = req.merchant!.merchantId;
    const { conversationId, text } = req.body as {
      conversationId: string;
      text: string;
    };

    if (!conversationId || !text) {
      return res.status(400).json({ message: "conversationId and text required" });
    }

    const conversation = await conversationService.getById(conversationId);
    if (!conversation || conversation.merchantId !== merchantId) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const waSession = await prisma.whatsAppSession.findUnique({
      where: { merchantId },
    });
    if (!waSession || waSession.status !== "connected") {
      return res.status(400).json({ message: "WhatsApp not connected" });
    }

    await openwaService.sendText(
      waSession.sessionId,
      conversation.customerPhone,
      text,
    );

    await conversationService.addMessage(conversationId, "agent", text);

    return res.json({ message: "Sent" });
  } catch (err) {
    next(err);
  }
}
