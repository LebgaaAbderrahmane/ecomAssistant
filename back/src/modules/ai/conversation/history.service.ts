import prisma from '../../../config/db.config';

export interface RecentConversationMessage {
  direction: 'in' | 'out';
  sender: 'customer' | 'merchant' | 'assistant';
  text: string;
}

const SENDER_MAP: Record<string, RecentConversationMessage['sender']> = {
  AI: 'assistant',
  CUSTOMER: 'customer',
  MERCHANT: 'merchant',
};

/**
 * Returns the most recent `limit` (default 10) messages for a conversation,
 * oldest → newest, so Layer 1 can read them as a natural transcript. Includes
 * both directions (in/out) and the sender (customer/merchant/assistant).
 *
 * If `excludeId` is provided, the message with that id (typically the current
 * client message being processed) is excluded from the transcript — it is
 * handled separately by the caller rather than duplicated inside the history.
 */
export async function getRecentMessages(
  conversationId: string,
  opts: { limit?: number; excludeId?: string } = {},
): Promise<RecentConversationMessage[]> {
  const limit = opts.limit ?? 10;
  const where = opts.excludeId
    ? { conversationId, id: { not: opts.excludeId } }
    : { conversationId };
  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      direction: true,
      sender: true,
      text: true,
    },
  });

  return messages
    .filter((m) => m.text && m.text.trim().length > 0)
    .map((m) => ({
      direction: m.direction === 'OUT' ? 'out' as const : 'in' as const,
      sender: SENDER_MAP[m.sender] ?? 'customer',
      text: m.text,
    }));
}
