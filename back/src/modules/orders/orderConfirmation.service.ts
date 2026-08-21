import prisma from '../../config/db.config';
import { buildOrderConfirmationText } from './orderConfirmation.templates';
import { openwaService } from '../whatsapp/whatsapp.service';
import { moduleLogger } from '../../lib/logger';

const log = moduleLogger('orders.confirm');

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
  for (const text of messages) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUT',
        sender: 'AI',
        text,
        role: 'assistant',
        content: text,
      },
    });
  }

  // Send sequentially via WhatsApp with typing indicators
  try {
    const waSession = await prisma.whatsAppSession.findUnique({
      where: { merchantId: order.merchantId },
    });
    if (waSession && (waSession.status === 'connected' || waSession.status === 'ready')) {
      if (order.customer.phone) {
        await openwaService.sendMessagesSequentially(
          waSession.sessionId,
          order.customer.phone,
          messages,
        );
        log.info({ orderId, count: messages.length }, 'confirmation sent via WhatsApp');
      } else {
        log.info({ customerId: order.customerId }, 'no phone for customer, skipping WhatsApp send');
      }
    } else {
      log.info({ merchantId: order.merchantId }, 'WhatsApp not connected, skipping send');
    }
  } catch (err) {
    log.error({ orderId, err }, 'failed to send confirmation via WhatsApp');
  }
};
