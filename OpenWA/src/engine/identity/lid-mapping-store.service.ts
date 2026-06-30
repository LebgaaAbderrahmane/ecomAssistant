import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LidMapping } from './lid-mapping.entity';
import { createLogger } from '../../common/services/logger.service';

/**
 * Narrow read/write port over the `lid -> phone` table. The Baileys session store depends on this (sync
 * reads on the resolution hot path + write-through) and the message from-filter depends on the reverse
 * lookup - both on the interface, not the concrete service, so each stays unit-testable with a fake
 * (mirrors {@link BaileysMessageStore}).
 */
export interface LidMappingStore {
  /** Sync read from the in-memory cache: phone digits, `null` = known-unresolved, `undefined` = never seen. */
  getCached(lid: string): string | null | undefined;
  /** Sync reverse lookup: the lids currently mapped to this phone (used by the message from-filter). */
  lidsForPhone(phone: string): string[];
  /** Write-through, last-write-wins: update the cache + persist. A `null` phone records a negative result. */
  remember(lid: string, phone: string | null, sessionId?: string): Promise<void>;
}

/**
 * Backs lid resolution with the persisted {@link LidMapping} table. Resolution must be synchronous
 * (filters/dispatch can't await a query), so the table is loaded into an in-memory map on boot and kept
 * warm by write-through. A forward map (lid -> phone) serves resolution; a reverse map (phone -> lids)
 * serves the from-filter.
 */
@Injectable()
export class LidMappingStoreService implements LidMappingStore, OnModuleInit {
  private readonly logger = createLogger('LidMappingStore');
  private readonly lidToPhone = new Map<string, string | null>();
  private readonly phoneToLids = new Map<string, Set<string>>();

  constructor(
    @InjectRepository(LidMapping, 'data')
    private readonly repo: Repository<LidMapping>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const rows = await this.repo.find();
      for (const row of rows) {
        this.index(row.lid, row.phone);
      }
      this.logger.log(`Loaded ${rows.length} lid->phone mappings into cache`);
    } catch (err) {
      // A missing table (migration not yet applied) or a read error must not block boot: resolution
      // falls back to the per-session in-memory map until the table is available.
      this.logger.warn(`Could not preload lid->phone mappings: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  getCached(lid: string): string | null | undefined {
    return this.lidToPhone.get(lid);
  }

  lidsForPhone(phone: string): string[] {
    const set = this.phoneToLids.get(phone);
    return set ? [...set] : [];
  }

  async remember(lid: string, phone: string | null, sessionId?: string): Promise<void> {
    if (!lid || this.lidToPhone.get(lid) === phone) {
      return; // unseen-or-changed only; a no-op write would just churn updatedAt
    }
    this.index(lid, phone);
    try {
      await this.repo.upsert({ lid, phone, sessionId: sessionId ?? null, updatedAt: new Date() }, ['lid']);
    } catch (err) {
      this.logger.warn(
        `Failed to persist lid->phone mapping for ${lid}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Update both in-memory indexes, dropping any stale reverse entry from a previous phone. */
  private index(lid: string, phone: string | null): void {
    const prev = this.lidToPhone.get(lid);
    if (prev && prev !== phone) {
      this.phoneToLids.get(prev)?.delete(lid);
    }
    this.lidToPhone.set(lid, phone);
    if (phone) {
      const set = this.phoneToLids.get(phone) ?? new Set<string>();
      set.add(lid);
      this.phoneToLids.set(phone, set);
    }
  }
}
