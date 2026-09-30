import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { persistMerchantMessage, type MerchantMessageDeps } from '../merchantMessage.service';

type Stored = {
  conversationId: string;
  content: string;
  opts: Record<string, unknown>;
};

const makeDeps = (overrides: Partial<MerchantMessageDeps> = {}): {
  deps: MerchantMessageDeps;
  stored: Stored[];
} => {
  const stored: Stored[] = [];
  const deps: MerchantMessageDeps = {
    messageFindByWaId: async () => null,
    messageFindRecentOwn: async () => null,
    conversationGetByPhone: async () => ({ id: 'conv-1' }),
    conversationGetByJid: async () => null,
    customerUpsertByPhone: async () => ({ id: 'cus-1', phone: '213792842752' }),
    conversationFindOrCreate: async () => ({ id: 'conv-new' }),
    addMessage: async (conversationId, content, opts) => {
      stored.push({ conversationId, content, opts: opts as unknown as Record<string, unknown> });
      return { id: 'msg-1' };
    },
    ...overrides,
  };
  return { deps, stored };
};

const baseInput = {
  merchantId: 'mer-1',
  to: '213792842752@c.us',
  phone: '213792842752',
  contentType: 'text',
  body: 'Oui, c\'est moi',
  createdAt: new Date('2026-09-17T20:55:35Z'),
};

describe('persistMerchantMessage', () => {
  it('stores the merchant reply as an OUT/MERCHANT row on the existing conversation', async () => {
    const { deps, stored } = makeDeps();

    const result = await persistMerchantMessage(
      { ...baseInput, waMessageId: 'wa-1' },
      { to: baseInput.to, body: baseInput.body },
      deps,
    );

    assert.equal(result, 'stored');
    assert.equal(stored.length, 1);
    assert.equal(stored[0].conversationId, 'conv-1');
    assert.equal(stored[0].content, 'Oui, c\'est moi');
    assert.equal(stored[0].opts.direction, 'OUT');
    assert.equal(stored[0].opts.sender, 'MERCHANT');
    assert.equal(stored[0].opts.contentType, 'text');
    assert.equal(stored[0].opts.whatsappMessageId, 'wa-1');
    assert.deepEqual(stored[0].opts.createdAt, baseInput.createdAt);
  });

  it('skips a send whose WhatsApp id is already stored (our own bot send)', async () => {
    let lookups = 0;
    let contentLookups = 0;
    const { deps, stored } = makeDeps({
      messageFindByWaId: async () => {
        lookups++;
        return { id: 'msg-existing' };
      },
      messageFindRecentOwn: async () => {
        contentLookups++;
        return null;
      },
    });

    const result = await persistMerchantMessage({ ...baseInput, waMessageId: 'wa-1' }, {}, deps);

    assert.equal(result, 'duplicate');
    assert.equal(lookups, 1);
    assert.equal(contentLookups, 0);
    assert.equal(stored.length, 0);
  });

  it('resolves a lid recipient through the customer jid when the phone does not match', async () => {
    const jidLookups: string[] = [];
    const { deps, stored } = makeDeps({
      conversationGetByPhone: async () => null,
      conversationGetByJid: async (_merchantId, jid) => {
        jidLookups.push(jid);
        return { id: 'conv-lid' };
      },
    });

    const result = await persistMerchantMessage(
      { ...baseInput, to: '59820958851268@lid', phone: '59820958851268', waMessageId: 'wa-2' },
      {},
      deps,
    );

    assert.equal(result, 'stored');
    assert.deepEqual(jidLookups, ['59820958851268@lid']);
    assert.equal(stored[0].conversationId, 'conv-lid');
  });

  it('creates the customer and conversation when the merchant writes to a new contact', async () => {
    const upserts: Array<Record<string, unknown>> = [];
    const { deps, stored } = makeDeps({
      conversationGetByPhone: async () => null,
      customerUpsertByPhone: async (args) => {
        upserts.push(args as unknown as Record<string, unknown>);
        return { id: 'cus-new', phone: args.phone };
      },
    });

    const result = await persistMerchantMessage(
      { ...baseInput, phone: '213555000011', waMessageId: 'wa-3', pushName: 'Karim' },
      {},
      deps,
    );

    assert.equal(result, 'stored');
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0].phone, '213555000011');
    assert.equal(upserts[0].pushName, 'Karim');
    assert.equal(upserts[0].waJid, undefined);
    assert.equal(stored[0].conversationId, 'conv-new');
  });

  it('falls back to a typed placeholder when the merchant sends media without a caption', async () => {
    const { deps, stored } = makeDeps();

    await persistMerchantMessage(
      { ...baseInput, body: '', contentType: 'image', waMessageId: 'wa-4' },
      {},
      deps,
    );

    assert.equal(stored[0].content, '[image message]');
    assert.equal(stored[0].opts.contentType, 'image');
  });

  it('stores the message when the payload carries no WhatsApp id and no own send matches', async () => {
    const { deps, stored } = makeDeps();

    const result = await persistMerchantMessage({ ...baseInput, waMessageId: null }, {}, deps);

    assert.equal(result, 'stored');
    assert.equal(stored.length, 1);
    assert.equal(stored[0].opts.whatsappMessageId, undefined);
  });

  it('skips a send whose id is unknown but an own row with the same content is recent', async () => {
    const ownLookups: Array<{ conversationId: string; content: string; since: Date }> = [];
    const { deps, stored } = makeDeps({
      messageFindRecentOwn: async (conversationId, content, since) => {
        ownLookups.push({ conversationId, content, since });
        return { id: 'msg-ai-1' };
      },
    });

    const result = await persistMerchantMessage(
      { ...baseInput, waMessageId: 'wa-unknown' },
      {},
      deps,
    );

    assert.equal(result, 'duplicate');
    assert.equal(stored.length, 0);
    assert.equal(ownLookups.length, 1);
    assert.equal(ownLookups[0].conversationId, 'conv-1');
    assert.equal(ownLookups[0].content, baseInput.body);
  });

  it('matches the content fallback on the typed placeholder for media without a caption', async () => {
    const ownLookups: string[] = [];
    const { deps, stored } = makeDeps({
      messageFindRecentOwn: async (_conversationId, content) => {
        ownLookups.push(content);
        return { id: 'msg-ai-2' };
      },
    });

    const result = await persistMerchantMessage(
      { ...baseInput, body: '', contentType: 'image', waMessageId: 'wa-unknown' },
      {},
      deps,
    );

    assert.equal(result, 'duplicate');
    assert.deepEqual(ownLookups, ['[image message]']);
    assert.equal(stored.length, 0);
  });

  it('looks back two minutes for the own-send fallback', async () => {
    const since: Date[] = [];
    const { deps } = makeDeps({
      messageFindRecentOwn: async (_conversationId, _content, at) => {
        since.push(at);
        return null;
      },
    });

    const before = Date.now();
    await persistMerchantMessage({ ...baseInput, waMessageId: 'wa-unknown' }, {}, deps);

    assert.equal(since.length, 1);
    const lookedBack = before - since[0].getTime();
    assert.ok(lookedBack >= 119_000, `looked back ${lookedBack}ms`);
    assert.ok(lookedBack <= 125_000, `looked back ${lookedBack}ms`);
  });
});
