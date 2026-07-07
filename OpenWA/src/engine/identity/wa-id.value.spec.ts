import { WaId } from './wa-id.value';
import { toNeutralJid } from './wa-id';

describe('WaId', () => {
  describe('fromEngineJid', () => {
    it('parses a phone user and folds @s.whatsapp.net to @c.us', () => {
      const id = WaId.fromEngineJid('628111@s.whatsapp.net');
      expect(id.kind).toBe('user');
      expect(id.phone).toBe('628111');
      expect(id.toNeutral()).toBe('628111@c.us');
    });

    it('strips a :device suffix from the phone', () => {
      expect(WaId.fromEngineJid('628111:12@s.whatsapp.net').phone).toBe('628111');
      expect(WaId.fromEngineJid('628111:12@s.whatsapp.net').toNeutral()).toBe('628111@c.us');
    });

    it('keeps an unresolved lid first-class (phone undefined, stays @lid)', () => {
      const id = WaId.fromEngineJid('111@lid');
      expect(id.kind).toBe('lid');
      expect(id.lid).toBe('111');
      expect(id.phone).toBeUndefined();
      expect(id.toNeutral()).toBe('111@lid');
    });

    it('resolves a lid to its phone when the resolver knows it', () => {
      const id = WaId.fromEngineJid('111@lid', () => '628999');
      expect(id.kind).toBe('lid');
      expect(id.lid).toBe('111');
      expect(id.phone).toBe('628999');
      expect(id.toNeutral()).toBe('628999@c.us');
    });

    it('parses groups, status, newsletter and broadcast', () => {
      expect(WaId.fromEngineJid('123-456@g.us').groupId).toBe('123-456');
      expect(WaId.fromEngineJid('123-456@g.us').toNeutral()).toBe('123-456@g.us');
      expect(WaId.fromEngineJid('status@broadcast').toNeutral()).toBe('status@broadcast');
      expect(WaId.fromEngineJid('123@newsletter').toNeutral()).toBe('123@newsletter');
      expect(WaId.fromEngineJid('123@broadcast').toNeutral()).toBe('123@broadcast');
    });
  });

  describe('fromUserInput', () => {
    it('treats bare digits as a phone-addressed user', () => {
      expect(WaId.fromUserInput('628111').toNeutral()).toBe('628111@c.us');
    });

    it('strips non-digits from a formatted phone', () => {
      expect(WaId.fromUserInput('+62 811').phone).toBe('62811');
    });

    it('parses a full jid like an engine id', () => {
      expect(WaId.fromUserInput('628111@c.us').kind).toBe('user');
      expect(WaId.fromUserInput('111@lid').kind).toBe('lid');
    });
  });

  describe('toJSON / serialization byte-identity', () => {
    // The wire format must not change: WaId serializes to exactly today's neutral string. Embedding a
    // WaId in a DTO and JSON.stringify-ing it yields the same string a raw id would have.
    it('serializes transparently inside a DTO', () => {
      const payload = { from: WaId.fromEngineJid('628111@s.whatsapp.net'), chatId: WaId.fromEngineJid('123@g.us') };
      expect(JSON.stringify(payload)).toBe('{"from":"628111@c.us","chatId":"123@g.us"}');
    });

    // Guard: WaId.toNeutral() is defined in terms of the adapters' toNeutralJid, so a representative
    // message.received payload (from/to/chatId/author) + group payload (owner/participants) stay
    // byte-identical to what the engine emits today.
    it('matches toNeutralJid for every representative id', () => {
      const resolve = (jid: string) => (jid.startsWith('111@') ? '628999' : null);
      const ids = [
        '628111@s.whatsapp.net',
        '628111:3@s.whatsapp.net',
        '628222@c.us',
        '111@lid', // resolves to 628999
        '222@lid', // stays @lid
        '123-456@g.us',
        'status@broadcast',
        '999@newsletter',
        '888@broadcast',
      ];
      for (const jid of ids) {
        expect(WaId.fromEngineJid(jid, resolve).toNeutral()).toBe(toNeutralJid(jid, resolve));
      }
    });
  });

  describe('refersToSamePerson (three-valued)', () => {
    it('true when phones match, false when they differ', () => {
      expect(WaId.fromEngineJid('628111@c.us').refersToSamePerson(WaId.fromEngineJid('628111@s.whatsapp.net'))).toBe(
        true,
      );
      expect(WaId.fromEngineJid('628111@c.us').refersToSamePerson(WaId.fromEngineJid('628222@c.us'))).toBe(false);
    });

    it('true when both carry the same lid', () => {
      expect(WaId.fromEngineJid('111@lid').refersToSamePerson(WaId.fromEngineJid('111@lid'))).toBe(true);
    });

    it("null ('couldn't tell') for a known phone vs an unresolved lid", () => {
      expect(WaId.fromEngineJid('628111@c.us').refersToSamePerson(WaId.fromEngineJid('111@lid'))).toBeNull();
    });

    it('matches a resolved lid to the phone it resolved to', () => {
      const resolvedLid = WaId.fromEngineJid('111@lid', () => '628999');
      expect(resolvedLid.refersToSamePerson(WaId.fromEngineJid('628999@c.us'))).toBe(true);
    });
  });
});
