import prisma from '../../config/db.config';
import { deliverAssistantReply } from '../whatsapp/reply.service';
import { agentProcessMessage, closeAgentClient, createAgentClient } from '../../grpc/agent.client.js';

async function escalateConversation(
  conversation: { id: string; merchantId: string },
  customer: { id: string; name: string | null; phone: string | null } | null
): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { takenOverByHuman: true, escalatedAt: new Date() },
  });
  try {
    await prisma.notification.create({
      data: {
        merchantId: conversation.merchantId,
        type: 'escalation',
        title: 'Conversation escaladée',
        message: `L'agent a escaladé la conversation avec le client ${customer?.name || customer?.phone || 'inconnu'}.`,
        link: '/dashboard/escalations',
      },
    });
  } catch (err) {
    console.error('[agentBridge] Failed to create escalation notification:', err);
  }
}

/**
 * gRPC message destination (MESSAGE_HANDLER=grpc): load the inbound message
 * and forward it to the Python agent's AgentService.ProcessMessage. The agent's
 * reply is persisted + sent by the backend; DECISION_ESCALATE / unavailability
 * hand the conversation to a human. A human-owned conversation is never given
 * an auto-reply. If the agent call fails the error is rethrown so the job
 * fails and BullMQ retries it.
 */
export const handleMessageViaAgent = async (messageId: string): Promise<void> => {
  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { conversation: true },
  });
  const { conversation } = message;
  const customer = await prisma.customer.findUnique({
    where: { id: conversation.customerId },
  });

  if (conversation.takenOverByHuman) {
    console.log(`[message] ${messageId} -> human owns conversation, skipping agent, reply not auto-sent`);
    return;
  }

  const client = createAgentClient();
  try {
    console.log(`[message] ${messageId} -> agent`);
    const response = await agentProcessMessage(client, {
      messageId,
      conversationId: conversation.id,
      merchantId: conversation.merchantId,
      customerId: conversation.customerId,
    });

    if (response.decision === 'DECISION_REPLY' && response.text.trim()) {
      await deliverAssistantReply(conversation.id, response.text);
      console.log(`[message] ${messageId} -> agent reply: "${response.text}"`);
      return;
    }

    console.log(`[message] ${messageId} -> agent decision ${response.decision}, escalating to human`);
  } catch (err) {
    console.error(`[message] ${messageId} -> agent call failed:`, err);
    throw err;
  } finally {
    closeAgentClient(client);
  }

  await escalateConversation(conversation, customer);
  console.log(`[message] ${messageId} -> conversation handed to human`);
};