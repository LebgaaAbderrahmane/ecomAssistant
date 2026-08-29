import prisma from '../../config/db.config';
import type { Prisma } from '@prisma/client';
import { buildOrderConfirmationText } from './orderConfirmation.templates';
import { openwaService } from '../whatsapp/whatsapp.service';
import { addOrderFlowToMemory, migrateMemory } from '../ai/flow/flowHelper';
import { moduleLogger } from '../../lib/logger';

const log = moduleLogger('orders.confirm');

export const sendOrderConfirmation = async (orderId: string) => {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { customer: true },
  });

  // Orders created and confirmed entirely in-conversation never get the
  // external confirmation template — the customer already confirmed by placing
  // the order in chat. The in-conversation acknowledgment is sufficient.
  if (order.orderSource === 'CONVERSATION') {
    log.info({ orderId, orderSource: order.orderSource }, 'conversational order, skipping confirmation template');
    return;
  }

  const conversation = await prisma.conversation.findFirstOrThrow({
    where: { merchantId: order.merchantId, customerId: order.customerId },
  });

  // Append an ORDER_PENDING flow to the existing memory so the customer
  // can confirm the order by replying "yes". Preserves any existing flows.
  const existingMemory = migrateMemory(conversation.memory);
  const memory = addOrderFlowToMemory(existingMemory, {
    orderId: order.id,
    productName: order.productName,
    totalAmount: order.totalAmount,
    quantity: order.quantity,
    wilaya: order.wilaya,
    commune: order.commune,
    customerName: order.customer.name ?? undefined,
    productId: order.productId,
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      memory: memory as unknown as Prisma.InputJsonValue,
      state: 'WAITING_CONFIRMATION',
    },
  });

  log.info({ conversationId: conversation.id, orderId, state: 'WAITING_CONFIRMATION' }, 'initialized ORDER_PENDING flow memory');

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
