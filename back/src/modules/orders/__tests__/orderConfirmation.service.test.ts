import { describe, it, expect, vi, beforeEach } from 'vitest';

const orderFindUniqueOrThrow = vi.fn();
const conversationFindFirstOrThrow = vi.fn();
const conversationUpdate = vi.fn();
const messageCreate = vi.fn();
const whatsAppSessionFindUnique = vi.fn();
const sendMessagesSequentially = vi.fn();

vi.mock('../../../config/db.config', () => ({
  default: {
    order: {
      findUniqueOrThrow: (...a: unknown[]) => orderFindUniqueOrThrow(...a),
    },
    conversation: {
      findFirstOrThrow: (...a: unknown[]) => conversationFindFirstOrThrow(...a),
      update: (...a: unknown[]) => conversationUpdate(...a),
    },
    message: {
      create: (...a: unknown[]) => messageCreate(...a),
    },
    whatsAppSession: {
      findUnique: (...a: unknown[]) => whatsAppSessionFindUnique(...a),
    },
  },
}));

vi.mock('../../whatsapp/whatsapp.service', () => ({
  openwaService: {
    sendMessagesSequentially: (...a: unknown[]) => sendMessagesSequentially(...a),
  },
}));

import { sendOrderConfirmation } from '../orderConfirmation.service';

describe('sendOrderConfirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orderFindUniqueOrThrow.mockResolvedValue({
      id: 'order-1',
      merchantId: 'merchant-1',
      customerId: 'customer-1',
      orderSource: 'CONVERSATION',
      status: 'CONFIRMED',
      productName: 'Shoes',
      quantity: 1,
      totalAmount: 100,
      wilaya: 'Alger',
      commune: 'Bab Ezzouar',
      customer: { id: 'customer-1', name: 'Ahmed', phone: '+213555000000', language: 'fr' },
    });
  });

  it('skips the confirmation template for a conversational order (early return)', async () => {
    await sendOrderConfirmation('order-1');

    // No conversation lookup, no flow/WAITING_CONFIRMATION mutation, no
    // message persistence, no WhatsApp send.
    expect(conversationFindFirstOrThrow).not.toHaveBeenCalled();
    expect(conversationUpdate).not.toHaveBeenCalled();
    expect(messageCreate).not.toHaveBeenCalled();
    expect(whatsAppSessionFindUnique).not.toHaveBeenCalled();
    expect(sendMessagesSequentially).not.toHaveBeenCalled();
  });

  it('does send the confirmation for a platform order', async () => {
    orderFindUniqueOrThrow.mockResolvedValue({
      id: 'order-2',
      merchantId: 'merchant-1',
      customerId: 'customer-1',
      orderSource: 'PLATFORM',
      status: 'PENDING',
      productName: 'Shoes',
      quantity: 1,
      totalAmount: 100,
      wilaya: 'Alger',
      commune: 'Bab Ezzouar',
      customer: { id: 'customer-1', name: 'Ahmed', phone: '+213555000000', language: 'fr' },
    });
    conversationFindFirstOrThrow.mockResolvedValue({
      id: 'conv-1',
      merchantId: 'merchant-1',
      customerId: 'customer-1',
      memory: null,
      language: 'fr',
    });
    whatsAppSessionFindUnique.mockResolvedValue({ sessionId: 'wa-1', status: 'connected' });
    sendMessagesSequentially.mockResolvedValue(undefined);

    await sendOrderConfirmation('order-2');

    expect(conversationUpdate).toHaveBeenCalled();
    expect(messageCreate).toHaveBeenCalled();
    expect(sendMessagesSequentially).toHaveBeenCalled();
  });
});
