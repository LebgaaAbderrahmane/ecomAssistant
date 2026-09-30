import prisma from "../../config/db.config";
import { conversationService } from "./conversation.service";

export interface MerchantMessageInput {
  merchantId: string;
  /** Recipient JID exactly as OpenWA reported it (`<phone>@c.us` or `<lid>@lid`). */
  to: string;
  /** Recipient phone digits, extracted from `to` by the caller. */
  phone: string;
  /** Content type already mapped to our own vocabulary (`text`, `image`, ...). */
  contentType: string;
  body: string;
  waMessageId?: string | null;
  pushName?: string;
  createdAt: Date;
}

export type MerchantMessageResult = "duplicate" | "stored";

/**
 * How far back an own outgoing row may be and still count as the same send. Wide
 * enough to cover webhook retries, measured against our own clock so a skewed
 * phone timestamp cannot defeat it.
 */
const OWN_SEND_WINDOW_MS = 120_000;

export interface MerchantMessageDeps {
  messageFindByWaId: (waMessageId: string) => Promise<{ id: string } | null>;
  /**
   * Recent outgoing row that is not a merchant message, i.e. one of our own API
   * sends, matching the exact same content in the same conversation.
   */
  messageFindRecentOwn: (
    conversationId: string,
    content: string,
    since: Date,
  ) => Promise<{ id: string } | null>;
  conversationGetByPhone: (
    merchantId: string,
    phone: string,
  ) => Promise<{ id: string } | null>;
  conversationGetByJid: (
    merchantId: string,
    jid: string,
  ) => Promise<{ id: string } | null>;
  customerUpsertByPhone: (args: {
    merchantId: string;
    phone: string;
    waJid?: string;
    pushName?: string;
  }) => Promise<{ id: string; phone: string | null }>;
  conversationFindOrCreate: (
    merchantId: string,
    customerId: string,
    customerPhone: string,
  ) => Promise<{ id: string }>;
  addMessage: (
    conversationId: string,
    content: string,
    opts: {
      direction: "OUT";
      sender: "MERCHANT";
      contentType: string;
      rawPayload: Record<string, unknown>;
      createdAt: Date;
      whatsappMessageId?: string;
    },
  ) => Promise<{ id: string }>;
}

const defaultDeps: MerchantMessageDeps = {
  messageFindByWaId: (waMessageId) =>
    prisma.message.findUnique({ where: { whatsappMessageId: waMessageId }, select: { id: true } }),
  messageFindRecentOwn: (conversationId, content, since) =>
    prisma.message.findFirst({
      where: {
        conversationId,
        content,
        direction: "OUT",
        sender: { not: "MERCHANT" },
        createdAt: { gte: since },
      },
      select: { id: true },
    }),
  conversationGetByPhone: (merchantId, phone) => conversationService.getByPhone(merchantId, phone),
  conversationGetByJid: (merchantId, jid) => conversationService.getByJid(merchantId, jid),
  customerUpsertByPhone: async ({ merchantId, phone, waJid, pushName }) =>
    prisma.customer.upsert({
      where: { merchantId_phone: { merchantId, phone } },
      update: {
        ...(waJid ? { waJid } : {}),
        ...(pushName ? { name: pushName } : {}),
      },
      create: {
        merchantId,
        phone,
        ...(waJid ? { waJid } : {}),
        name: pushName || `WhatsApp ${phone.slice(-6)}`,
      },
      select: { id: true, phone: true },
    }),
  conversationFindOrCreate: (merchantId, customerId, customerPhone) =>
    conversationService.findOrCreateByCustomer(merchantId, customerId, customerPhone),
  addMessage: (conversationId, content, opts) =>
    conversationService.addMessage(conversationId, "agent", content, opts),
};

/**
 * Store a message the merchant typed on the linked WhatsApp phone.
 *
 * OpenWA emits `message.sent` for every outgoing `fromMe` message, including the
 * sends we issue ourselves through the API. Those rows already exist in our
 * table, so a known WhatsApp id means this is our own send and is skipped
 * instead of being stored twice. If the id is unknown, a second check looks for
 * an own outgoing row with the same content in the same conversation: the send
 * API id and the id on the webhook can disagree, and a merchant repeating their
 * own text is not a match because MERCHANT rows are excluded. The merchant's own
 * reply is stored as OUT/MERCHANT so the transcript stays complete.
 */
export const persistMerchantMessage = async (
  input: MerchantMessageInput,
  rawPayload: Record<string, unknown>,
  deps: MerchantMessageDeps = defaultDeps,
): Promise<MerchantMessageResult> => {
  if (input.waMessageId) {
    const known = await deps.messageFindByWaId(input.waMessageId);
    if (known) return "duplicate";
  }

  const isLid = input.to.toLowerCase().includes("@lid");
  let conversation = await deps.conversationGetByPhone(input.merchantId, input.phone);
  if (!conversation && isLid) {
    conversation = await deps.conversationGetByJid(input.merchantId, input.to);
  }
  if (!conversation) {
    const customer = await deps.customerUpsertByPhone({
      merchantId: input.merchantId,
      phone: input.phone,
      ...(isLid ? { waJid: input.to } : {}),
      ...(input.pushName ? { pushName: input.pushName } : {}),
    });
    conversation = await deps.conversationFindOrCreate(
      input.merchantId,
      customer.id,
      customer.phone ?? input.phone,
    );
  }

  const content = input.body || `[${input.contentType} message]`;

  const recentOwn = await deps.messageFindRecentOwn(
    conversation.id,
    content,
    new Date(Date.now() - OWN_SEND_WINDOW_MS),
  );
  if (recentOwn) {
    console.log(
      `[WhatsApp] Skipped message.sent duplicate (own send) to=${input.to} conversation=${conversation.id}`,
    );
    return "duplicate";
  }

  await deps.addMessage(conversation.id, content, {
    direction: "OUT",
    sender: "MERCHANT",
    contentType: input.contentType,
    rawPayload,
    createdAt: input.createdAt,
    ...(input.waMessageId ? { whatsappMessageId: input.waMessageId } : {}),
  });

  return "stored";
};
