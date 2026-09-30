import prisma from '../../config/db.config';
import { buildOrderConfirmationText } from './orderConfirmation.templates';
import { openwaService } from '../whatsapp/whatsapp.service';

export const sendOrderConfirmation = async (orderId: string) => {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { customer: true },
  });

  const conversation = await prisma.conversation.findFirstOrThrow({
    where: { merchantId: order.merchantId, customerId: order.customerId },
  });

  const language = order.customer.language ?? conversation.language ?? 'auto';

  const messages = buildOrderConfirmationText(
    {
      productName: order.productName,
      quantity: order.quantity,
      totalAmount: order.totalAmount,
      currency: 'DZD',
      wilaya: order.wilaya,
      commune: order.commune,
      clientName: order.customer.name,
    },
    language
  );

  // Persist each confirmation message as a separate DB row
  const messageIds: string[] = [];
  for (const text of messages) {
    const row = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUT',
        sender: 'AI',
        text,
        role: 'assistant',
        content: text,
      },
    });
    messageIds.push(row.id);
  }
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  // Send sequentially via WhatsApp with typing indicators
  try {
    const waSession = await prisma.whatsAppSession.findUnique({
      where: { merchantId: order.merchantId },
    });
    if (waSession && (waSession.status === 'connected' || waSession.status === 'ready')) {
      if (order.customer.phone) {
        const sentIds = await openwaService.sendMessagesSequentially(
          waSession.sessionId,
          order.customer.phone,
          messages,
        );
        // Record the WhatsApp ids so the `message.sent` webhook recognizes these
        // rows as our own sends instead of storing them again as merchant messages.
        for (let i = 0; i < messageIds.length && i < sentIds.length; i++) {
          await prisma.message.update({
            where: { id: messageIds[i] },
            data: { whatsappMessageId: sentIds[i] },
          });
        }
        console.log(`[orders] Confirmation sent via WhatsApp for order ${orderId} (${messages.length} messages)`);
      } else {
        console.log(`[orders] No phone for customer ${order.customerId}, skipping WhatsApp send`);
      }
    } else {
      console.log(`[orders] WhatsApp not connected for merchant ${order.merchantId}, skipping send`);
    }
  } catch (err) {
    console.error(`[orders] Failed to send confirmation via WhatsApp for order ${orderId}:`, err);
  }
};
