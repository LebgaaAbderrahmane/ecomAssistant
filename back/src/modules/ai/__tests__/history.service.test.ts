import { describe, it, expect, vi, beforeEach } from 'vitest';

const messageFindMany = vi.fn();

vi.mock('../../../config/db.config', () => ({
  default: {
    message: {
      findMany: (...a: unknown[]) => messageFindMany(...a),
    },
  },
}));

import { getRecentMessages } from '../conversation/history.service';

describe('getRecentMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries the most recent 10 messages of the conversation, oldest → newest', async () => {
    messageFindMany.mockResolvedValue([{ direction: 'IN', sender: 'CUSTOMER', text: 'hello' }]);

    await getRecentMessages('conv-1');

    expect(messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: 'conv-1' },
        orderBy: { createdAt: 'asc' },
        take: 10,
        select: { direction: true, sender: true, text: true },
      }),
    );
  });

  it('honors a custom limit', async () => {
    messageFindMany.mockResolvedValue([]);
    await getRecentMessages('conv-1', { limit: 25 });
    expect(messageFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 25 }));
  });

  it('excludes the current message from the transcript when excludeId is provided', async () => {
    messageFindMany.mockResolvedValue([]);
    await getRecentMessages('conv-1', { limit: 10, excludeId: 'msg-current' });
    expect(messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: 'conv-1', id: { not: 'msg-current' } },
      }),
    );
  });

  it('does not add an id filter when excludeId is omitted', async () => {
    messageFindMany.mockResolvedValue([]);
    await getRecentMessages('conv-1');
    expect(messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: 'conv-1' } }),
    );
  });

  it('maps sender and direction to the public shape', async () => {
    messageFindMany.mockResolvedValue([
      { direction: 'OUT', sender: 'AI', text: 'Bonjour' },
      { direction: 'IN', sender: 'CUSTOMER', text: 'Bonjour à vous' },
      { direction: 'OUT', sender: 'MERCHANT', text: 'Message marchand' },
    ]);

    const result = await getRecentMessages('conv-1');

    expect(result).toEqual([
      { direction: 'out', sender: 'assistant', text: 'Bonjour' },
      { direction: 'in', sender: 'customer', text: 'Bonjour à vous' },
      { direction: 'out', sender: 'merchant', text: 'Message marchand' },
    ]);
  });

  it('filters out empty or whitespace-only messages', async () => {
    messageFindMany.mockResolvedValue([
      { direction: 'IN', sender: 'CUSTOMER', text: '   ' },
      { direction: 'OUT', sender: 'AI', text: '' },
      { direction: 'IN', sender: 'CUSTOMER', text: 'real content' },
    ]);

    const result = await getRecentMessages('conv-1');
    expect(result).toEqual([{ direction: 'in', sender: 'customer', text: 'real content' }]);
  });
});
