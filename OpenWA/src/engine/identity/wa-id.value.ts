import { parseWaId, userPart, WaIdKind } from './wa-id';

/**
 * Typed WhatsApp identity. A thin, in-memory value object over the {@link parseWaId} primitives that
 * makes the kind and the (maybe-unknown) phone first-class, so a lid whose phone we don't know is
 * visible in the type instead of re-derived by every caller.
 *
 * `WaId` is never persisted and never crosses the wire: the boundary format stays the neutral string
 * ({@link toNeutral}). It carries no behaviour the engine didn't already have - `toNeutral()` delegates
 * to the same {@link toNeutralJid} the adapters use, so the serialized string is byte-identical.
 */
export class WaId {
  private constructor(
    readonly kind: WaIdKind,
    /** The original engine JID, verbatim. Debug/provenance only - excluded from matching. */
    readonly raw: string,
    /** E.164 phone digits, when known (a resolved lid carries this; an unresolved one does not). */
    readonly phone?: string,
    /** The lid number, when this id is or carries a lid. */
    readonly lid?: string,
    /** The group id, for groups. */
    readonly groupId?: string,
  ) {}

  /** Build from an engine JID, resolving a lid to its phone when the engine knows the mapping. */
  static fromEngineJid(jid: string, resolvePhone?: (jid: string) => string | null): WaId {
    const parsed = parseWaId(jid);
    switch (parsed.kind) {
      case 'user':
        return new WaId('user', jid, parsed.userPart);
      case 'group':
        return new WaId('group', jid, undefined, undefined, parsed.userPart);
      case 'lid': {
        const phone = resolvePhone?.(jid) ?? undefined;
        return new WaId('lid', jid, phone, parsed.userPart);
      }
      default:
        return new WaId(parsed.kind, jid);
    }
  }

  /** Build from API/user input: bare digits are a phone-addressed user; anything else parses as a JID. */
  static fromUserInput(value: string): WaId {
    const trimmed = value.trim();
    if (trimmed && !trimmed.includes('@')) {
      const digits = trimmed.replace(/\D/g, '');
      return new WaId('user', trimmed, digits || trimmed);
    }
    return WaId.fromEngineJid(trimmed);
  }

  /**
   * The neutral boundary string, built from the resolved fields. Kept in lock-step with the adapters'
   * {@link toNeutralJid} (a spec asserts byte-identity for every engine id), so the emitted string is
   * identical to today's wire format - WaId changes nothing observable.
   */
  toNeutral(): string {
    switch (this.kind) {
      case 'user':
        return `${this.phone}@c.us`;
      case 'group':
        return `${this.groupId}@g.us`;
      case 'lid':
        return this.phone ? `${this.phone}@c.us` : `${this.lid}@lid`;
      case 'status':
        return 'status@broadcast';
      case 'newsletter':
        return `${userPart(this.raw)}@newsletter`;
      case 'broadcast':
        return `${userPart(this.raw)}@broadcast`;
      default:
        return this.raw;
    }
  }

  toString(): string {
    return this.toNeutral();
  }

  toJSON(): string {
    return this.toNeutral();
  }

  /**
   * Relational same-person test, deliberately three-valued: `true` when they share a lid or a known
   * phone, `false` when both phones are known and differ, and `null` ("couldn't tell") when one side is
   * a phone and the other only an unresolved lid. `raw` is excluded so the same person seen via two
   * engines doesn't split. This is NOT a hashable key - matching is relational while lids are unresolved.
   */
  refersToSamePerson(other: WaId): boolean | null {
    if (this.lid && other.lid) {
      return this.lid === other.lid;
    }
    if (this.phone && other.phone) {
      return this.phone === other.phone;
    }
    return null;
  }
}

/** Re-exported for callers that only need the kind union without importing the primitives module. */
export type { WaIdKind };
export { userPart };
