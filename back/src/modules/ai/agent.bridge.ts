import prisma from '../../config/db.config';
import { deliverAssistantReply } from '../whatsapp/reply.service';
import {
  agentProcessMessage,
  closeAgentClient,
  createAgentClient,
} from '../../grpc/agent.client.js';
import { runAgentBridge, type AgentBridgeDeps } from './agentBridgeCore';

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

const defaultDeps: AgentBridgeDeps = {
  findMessage: async (messageId) => {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true },
    });
    if (!message) return null;
    const { conversation } = message;
    return {
      id: message.id,
      conversation: {
        id: conversation.id,
        merchantId: conversation.merchantId,
        customerId: conversation.customerId,
        takenOverByHuman: conversation.takenOverByHuman,
      },
    };
  },
  findCustomer: async (customerId) =>
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, phone: true },
    }),
  callAgent: async (request) => {
    const client = createAgentClient();
    try {
      return await agentProcessMessage(client, request);
    } finally {
      closeAgentClient(client);
    }
  },
  deliverReply: (conversationId, text) => deliverAssistantReply(conversationId, text),
  escalate: escalateConversation,
};

export const handleMessageViaAgent = (messageId: string): Promise<void> =>
  runAgentBridge(messageId, defaultDeps);