import prisma from '../../config/db.config';
import { deliverAssistantReply } from '../whatsapp/reply.service';
import { processMessage } from './agent.service';
import { runLegacyPipelineWithFallback, type LegacyPipelineDeps } from './legacyWithFallbackCore';

export const LEGACY_FALLBACK_REPLY = "Désolé, je n'ai pas bien compris votre message. Pouvez-vous réessayer par texte ou me l'envoyer à nouveau ?";

const defaultDeps: LegacyPipelineDeps = {
  runPipeline: processMessage,
  findConversationId: async (messageId) => {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true },
    });
    return message?.conversationId ?? null;
  },
  deliverFallback: (conversationId) =>
    deliverAssistantReply(conversationId, LEGACY_FALLBACK_REPLY),
};

export const processMessageWithFallback = (messageId: string): Promise<void> =>
  runLegacyPipelineWithFallback(messageId, defaultDeps);