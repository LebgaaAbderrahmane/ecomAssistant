import prisma from '../../config/db.config';
import { openwaService } from '../whatsapp/whatsapp.service';
import { agentProcessMessage, closeAgentClient, createAgentClient } from '../../grpc/agent.client.js';
import { processMessage } from './agent.service';

async function persistAndSendReply(
  conversation: { id: string; merchantId: string },
  customer: { id: string; phone: string | null } | null,
  texts: string[]
): Promise<void> {
  const phone = customer?.phone ?? null;
  for (const text of texts) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUT',
        sender: 'AI',
        content: text,
        text,
        role: 'assistant',
      },
    });
  }

  try {
    const waSession = await prisma.whatsAppSession.findUnique({
      where: { merchantId: conversation.merchantId },
    });
    if (waSession && (waSession.status === 'connected' || waSession.status === 'ready')) {
      if (phone) {
        await openwaService.sendMessagesSequentially(waSession.sessionId, phone, texts);
        console.log(
          `[agentBridge] Reply sent via WhatsApp to ${phone} (${texts.length} messages)`
        );
      } else {
        console.log(`[agentBridge] No phone found for customer ${customer?.id}, reply not sent`);
      }
    } else {
      console.log(
        `[agentBridge] WhatsApp not connected for merchant ${conversation.merchantId}, reply not sent`
      );
    }
  } catch (err) {
    console.error('[agentBridge] Failed to send reply via WhatsApp:', err);
  }
}

/**
 * gRPC message destination (MESSAGE_HANDLER=grpc): load the inbound message,
 * forward it to the Python agent's AgentService.ProcessMessage, then persist
 * + send the agent's reply. If the agent call fails the error is rethrown so
 * the job fails and BullMQ retries it. Falls back to the legacy local pipeline
 * only on DECISION_UNAVAILABLE.
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
      await persistAndSendReply(conversation, customer, [response.text]);
      console.log(`[message] ${messageId} -> agent reply: "${response.text}"`);
      return;
    }

    if (response.decision === 'DECISION_ESCALATE') {
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
      console.log(`[message] ${messageId} -> agent escalated conversation`);
      return;
    }

    console.log(
      `[message] ${messageId} -> agent unavailable (${response.decision}), falling back to legacy handler`
    );
  } catch (err) {
    console.error(`[message] ${messageId} -> agent call failed:`, err);
    throw err;
  } finally {
    closeAgentClient(client);
  }

  await processMessage(messageId);
};