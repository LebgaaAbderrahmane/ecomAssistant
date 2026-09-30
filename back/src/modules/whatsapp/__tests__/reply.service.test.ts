import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deliverAssistantReply, type ReplyServiceDeps } from '../reply.service';

let nextRowId = 0;

const makeDeps = (overrides: Partial<ReplyServiceDeps> = {}): ReplyServiceDeps => ({
  conversationFindUnique: async () => ({
    id: 'conv-1',
    merchantId: 'mer-1',
    customerId: 'cus-1',
    takenOverByHuman: false,
  }),
  customerFindUnique: async () => ({ id: 'cus-1', phone: '+21369999991', waJid: null }),
  messageCreate: async () => ({ id: `msg-${++nextRowId}` }),
  messageUpdate: async () => undefined,
  conversationUpdate: async () => undefined,
  whatsAppSessionFindUnique: async () => ({ sessionId: 'sess-1', status: 'connected' }),
  sendMessagesSequentially: async () => [],
  ...overrides,
});

describe('deliverAssistantReply', () => {
  it('happy path: persists an OUT/AI row per text and sends via WhatsApp', async (t) => {
    const created: Array<Record<string, unknown>> = [];
    const send = t.mock.fn(async (_sessionId: string, _phone: string, _texts: string[]) => []);
    const deps = makeDeps({
      messageCreate: async (args) => {
        created.push(args.data as Record<string, unknown>);
        return { id: `msg-${created.length}` };
      },
      sendMessagesSequentially: send,
    });

    await deliverAssistantReply('conv-1', ['Bonjour', 'Voici les infos'], deps);

    assert.equal(created.length, 2);
    assert.deepEqual(created.map((m) => m.direction), ['OUT', 'OUT']);
    assert.deepEqual(created.map((m) => m.sender), ['AI', 'AI']);
    assert.deepEqual(created.map((m) => m.role), ['assistant', 'assistant']);
    assert.deepEqual(created.map((m) => m.text), ['Bonjour', 'Voici les infos']);
    assert.equal(send.mock.callCount(), 1);
    assert.deepEqual(send.mock.calls[0].arguments, ['sess-1', '+21369999991', ['Bonjour', 'Voici les infos']]);
  });

  it('happy path: a single string is delivered as a one-message array', async (t) => {
    const send = t.mock.fn(async (_s: string, _p: string, _t: string[]) => []);
    const deps = makeDeps({ sendMessagesSequentially: send });

    await deliverAssistantReply('conv-1', 'Bonjour seul', deps);

    assert.equal(send.mock.callCount(), 1);
    assert.deepEqual(send.mock.calls[0].arguments[2], ['Bonjour seul']);
  });

  it('records the WhatsApp ids returned by the send on the persisted rows', async () => {
    const updated: Array<Record<string, unknown>> = [];
    let created = 0;
    const deps = makeDeps({
      messageCreate: async () => ({ id: `msg-${++created}` }),
      messageUpdate: async (args) => {
        updated.push(args as unknown as Record<string, unknown>);
        return undefined;
      },
      sendMessagesSequentially: async () => ['wa-1', 'wa-2'],
    });

    await deliverAssistantReply('conv-1', ['Bonjour', 'Voici les infos'], deps);

    assert.deepEqual(updated, [
      { where: { id: 'msg-1' }, data: { whatsappMessageId: 'wa-1' } },
      { where: { id: 'msg-2' }, data: { whatsappMessageId: 'wa-2' } },
    ]);
  });

  it('bumps the conversation lastMessageAt when replies are persisted', async () => {
    const updated: Array<Record<string, unknown>> = [];
    const deps = makeDeps({
      conversationUpdate: async (args) => {
        updated.push(args as unknown as Record<string, unknown>);
        return undefined;
      },
    });

    await deliverAssistantReply('conv-1', 'Bonjour', deps);

    assert.equal(updated.length, 1);
    assert.equal((updated[0].where as { id: string }).id, 'conv-1');
    assert.ok((updated[0].data as { lastMessageAt: Date }).lastMessageAt instanceof Date);
  });

  it('takeover gate: never persists or sends when a human owns the conversation', async (t) => {
    let created = 0;
    const send = t.mock.fn(async (_s: string, _p: string, _t: string[]) => []);
    const deps = makeDeps({
      conversationFindUnique: async () => ({
        id: 'conv-1',
        merchantId: 'mer-1',
        customerId: 'cus-1',
        takenOverByHuman: true,
      }),
      messageCreate: async () => {
        created++;
        return { id: 'msg-x' };
      },
      sendMessagesSequentially: send,
    });

    await deliverAssistantReply('conv-1', 'Bonjour', deps);

    assert.equal(created, 0);
    assert.equal(send.mock.callCount(), 0);
  });

  it('fallback path: rows are persisted and a WhatsApp send failure is swallowed', async (t) => {
    let created = 0;
    const send = t.mock.fn(async (_s: string, _p: string, _t: string[]) => {
      throw new Error('openwa offline');
    });
    const deps = makeDeps({
      messageCreate: async () => {
        created++;
        return { id: 'msg-y' };
      },
      sendMessagesSequentially: send,
    });

    await deliverAssistantReply('conv-1', 'Bonjour', deps); // must not throw

    assert.equal(created, 1);
    assert.equal(send.mock.callCount(), 1);
  });

  it('sends to the LID jid when the customer is genuinely lid-only (phone is the LID placeholder)', async (t) => {
    const send = t.mock.fn(async (_s: string, _p: string, _t: string[]) => []);
    const deps = makeDeps({
      customerFindUnique: async () => ({
        id: 'cus-1',
        phone: '59820958851268',
        waJid: '59820958851268@lid',
      }),
      sendMessagesSequentially: send,
    });

    await deliverAssistantReply('conv-1', 'Bonjour', deps);

    assert.equal(send.mock.callCount(), 1);
    assert.deepEqual(send.mock.calls[0].arguments, [
      'sess-1',
      '59820958851268@lid',
      ['Bonjour'],
    ]);
  });

  it('prefers the real phone over the LID jid when the customer record holds one', async (t) => {
    const send = t.mock.fn(async (_s: string, _p: string, _t: string[]) => []);
    const deps = makeDeps({
      customerFindUnique: async () => ({
        id: 'cus-1',
        phone: '+213792842752',
        waJid: '59820958851268@lid',
      }),
      sendMessagesSequentially: send,
    });

    await deliverAssistantReply('conv-1', 'Bonjour', deps);

    assert.equal(send.mock.callCount(), 1);
    assert.deepEqual(send.mock.calls[0].arguments, [
      'sess-1',
      '+213792842752',
      ['Bonjour'],
    ]);
  });

  it('does not send when the WhatsApp session is not connected', async (t) => {
    const send = t.mock.fn(async (_s: string, _p: string, _t: string[]) => []);
    const deps = makeDeps({
      whatsAppSessionFindUnique: async () => ({ sessionId: 'sess-1', status: 'disconnected' }),
      sendMessagesSequentially: send,
    });

    await deliverAssistantReply('conv-1', 'Bonjour', deps);

    assert.equal(send.mock.callCount(), 0);
  });
});
