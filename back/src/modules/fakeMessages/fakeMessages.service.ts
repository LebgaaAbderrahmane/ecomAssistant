import prisma from "../../config/db.config";
import { enqueueMessageJob } from "../../queues/message.queue";
import { FakeMessageInput } from '../../validators/messages.validator';

export const ingestFakeMessage = async (input: FakeMessageInput) => {
  const customer = await prisma.customer.upsert({
    where: { merchantId_phone: { merchantId: input.merchantId, phone: input.customerPhone } },
    update: {},
    create: { merchantId: input.merchantId, phone: input.customerPhone },
  });

  const conversation =
    (await prisma.conversation.findFirst({
      where: { merchantId: input.merchantId, customerId: customer.id, state: { not: 'FINISHED' } },
    })) ??
    (await prisma.conversation.create({
      data: { merchantId: input.merchantId, customerId: customer.id },
    }));

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: 'user',
      content: input.text,
      direction: 'IN',
      sender: 'CUSTOMER',
      text: input.text,
    },
  });

  await enqueueMessageJob(message.id);

  return { messageId: message.id, conversationId: conversation.id };
};