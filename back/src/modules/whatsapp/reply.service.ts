import prisma from '../../config/db.config';

export interface ReplyServiceDeps {
  conversationFindUnique: (
    args: { where: { id: string } }
  ) => Promise<{ id: string; merchantId: string; customerId: string; takenOverByHuman: boolean } | null>;
  customerFindUnique: (
    args: { where: { id: string } }
  ) => Promise<{ id: string; phone: string | null; waJid: string | null } | null>;
  messageCreate: (args: {
    data: {
      conversationId: string;
      direction: string;
      sender: string;
      content: string;
      text: string;
      role: string;
    };
  }) => Promise<unknown>;
  whatsAppSessionFindUnique: (
    args: { where: { merchantId: string } }
  ) => Promise<{ sessionId: string; status: string } | null>;
  sendMessagesSequentially: (sessionId: string, phone: string, texts: string[]) => Promise<void>;
}

const defaultDeps: ReplyServiceDeps = {
  conversationFindUnique: (args) => prisma.conversation.findUnique(args as never),
  customerFindUnique: (args) => prisma.customer.findUnique(args as never),
  messageCreate: (args) => prisma.message.create(args as never),
  whatsAppSessionFindUnique: (args) => prisma.whatsAppSession.findUnique(args as never),
  sendMessagesSequentially: async (sessionId, phone, texts) => {
    const { openwaService } = await import('./whatsapp.service');
    await openwaService.sendMessagesSequentially(sessionId, phone, texts);
  },
};

/**
 * Pick the address an assistant reply should be delivered to.
 *
 * Outbound to a real number (`<phone>@c.us`) is the reliable WhatsApp channel,
 * so it always wins over the privacy id. A customer whose record only carries a
 * LID-placeholder phone (phone === waJid digits) is genuinely lid-only — nothing
 * real to send to — so replies fall back to the LID jid as a best effort.
 */
function resolveDeliveryTarget(customer: {
  phone: string | null;
  waJid: string | null;
} | null): string | null {
  if (!customer) return null;
  const { phone, waJid } = customer;
  if (waJid?.toLowerCase().endsWith("@lid")) {
    const lidDigits = waJid.slice(0, waJid.indexOf("@"));
    if (!phone || phone === lidDigits) return waJid;
  }
  return phone ?? waJid ?? null;
}

/**
 * Persist an assistant reply as OUT/AI message row(s), then deliver it over
 * WhatsApp when the merchant's session is connected (sequential, with typing
 * indicators). A human-owned conversation is never given an auto-reply.
 * Delivery problems are logged and swallowed so a failed send never fails the
 * message job.
 */
export const deliverAssistantReply = async (
  conversationId: string,
  text: string | string[],
  deps: ReplyServiceDeps = defaultDeps,
): Promise<void> => {
  const texts = Array.isArray(text) ? text : [text];
  const conversation = await deps.conversationFindUnique({ where: { id: conversationId } });
  if (!conversation) {
    console.warn(`[reply] conversation ${conversationId} not found, reply not persisted or sent`);
    return;
  }
  if (conversation.takenOverByHuman) {
    console.log(`[reply] human owns conversation ${conversationId}, reply not persisted or sent`);
    return;
  }
  const customer = await deps.customerFindUnique({ where: { id: conversation.customerId } });

  // Persist each reply message as a separate DB row
  for (const t of texts) {
    await deps.messageCreate({
      data: {
        conversationId,
        direction: 'OUT',
        sender: 'AI',
        content: t,
        text: t,
        role: 'assistant',
      },
    });
  }

  // ─── Send reply via WhatsApp (sequential with typing indicators) ─────
  try {
    const waSession = await deps.whatsAppSessionFindUnique({
      where: { merchantId: conversation.merchantId },
    });
    if (waSession && (waSession.status === 'connected' || waSession.status === 'ready')) {
      const target = resolveDeliveryTarget(customer);
      if (target) {
        await deps.sendMessagesSequentially(
          waSession.sessionId,
          target,
          texts,
        );
        console.log(`[reply] Sent via WhatsApp to ${target} (${texts.length} messages)`);
      } else {
        console.log(`[reply] No phone found for customer ${conversation.customerId}, reply not sent`);
      }
    } else {
      console.log(`[reply] WhatsApp not connected for merchant ${conversation.merchantId}, reply not sent`);
    }
  } catch (err) {
    console.error('[reply] Failed to send reply via WhatsApp:', err);
  }
};