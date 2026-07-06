import prisma from '../../config/db.config';
import { buildOrderConfirmationText } from './orderConfirmation.templates';

export const sendOrderConfirmation = async (orderId: string) => {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { customer: true },
  });

  const conversation = await prisma.conversation.findFirstOrThrow({
    where: { currentOrderId: order.id },
  });

  const language = order.customer.language ?? conversation.language ?? 'auto';

  const text = buildOrderConfirmationText(
    {
      productName: order.productName,
      quantity: order.quantity,
      totalAmount: order.totalAmount,
      currency: 'DZD', // Order has no currency column — assumed DZD project-wide; flag if that's wrong
      wilaya: order.wilaya,
      commune: order.commune,
      address: order.address,
      clientName: order.customer.name,
    },
    language
  );

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'OUT',
      sender: 'AI',
      text,
    },
  });

  // Not sent via OpenWA yet — same stopping point as LLM #2 replies right now.
  console.log(`[orders] confirmation composed for order ${orderId}: "${text}"`);
};