import { describe, it, expect, vi, beforeEach } from 'vitest';

const conversationUpsert = vi.fn();

vi.mock('../../../config/db.config', () => ({
  default: {
    conversation: {
      upsert: (...a: unknown[]) => conversationUpsert(...a),
    },
  },
}));

import { conversationService } from '../conversation.service';

describe('conversationService.findOrCreateByCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses an atomic upsert on the merchantId_customerId unique key', async () => {
    conversationUpsert.mockResolvedValue({ id: 'conv-1' });

    const result = await conversationService.findOrCreateByCustomer(
      'm1',
      'c1',
      '+213555000000',
    );

    expect(conversationUpsert).toHaveBeenCalledWith({
      where: { merchantId_customerId: { merchantId: 'm1', customerId: 'c1' } },
      update: {},
      create: { merchantId: 'm1', customerId: 'c1', customerPhone: '+213555000000', status: 'ACTIVE' },
    });
    expect(result).toEqual({ id: 'conv-1' });
  });

  it('continues the existing conversation when one already exists', async () => {
    // upsert resolves the existing row (i.e. update branch) — no second create,
    // so a concurrent request can never collide on the unique key.
    conversationUpsert.mockResolvedValue({ id: 'conv-existing' });

    const result = await conversationService.findOrCreateByCustomer('m1', 'c1', '+213555000000');
    expect(result).toEqual({ id: 'conv-existing' });
    expect(conversationUpsert).toHaveBeenCalledTimes(1);
  });
});

describe('conversationService.createFromOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts and attaches the order to the existing conversation', async () => {
    conversationUpsert.mockResolvedValue({ id: 'conv-1' });

    const result = await conversationService.createFromOrder('m1', 'order-1', 'c1', '+213555000000');

    expect(conversationUpsert).toHaveBeenCalledWith({
      where: { merchantId_customerId: { merchantId: 'm1', customerId: 'c1' } },
      update: { currentOrderId: 'order-1' },
      create: { merchantId: 'm1', customerId: 'c1', customerPhone: '+213555000000', currentOrderId: 'order-1', status: 'ACTIVE' },
    });
    expect(result).toEqual({ id: 'conv-1' });
  });
});
