import { randomUUID } from 'crypto';
import { redis } from '../config';
import { moduleLogger } from './logger';

const log = moduleLogger('lock');

// ─── Types ────────────────────────────────────────────────────────────────

export type LockHolder = 'orchestrator' | 'layer2' | 'merchant-engagement';

export type LockHandle = {
  lockId: string;
  conversationId: string;
  holder: string;
  acquiredAt: number;
  extend: () => Promise<void>;
  release: () => Promise<void>;
};

export type LockOptions = {
  leaseMs?: number;
  retryMs?: number;
  retryTimeoutMs?: number;
  heartbeatMs?: number;
};

// ─── Defaults ─────────────────────────────────────────────────────────────

const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_RETRY_MS = 100;
const DEFAULT_RETRY_TIMEOUT_MS = 5_000;
const DEFAULT_HEARTBEAT_MS = 10_000;

// ─── Lua scripts ──────────────────────────────────────────────────────────

// Release: check lockId matches then DEL (atomic, prevents releasing someone else's lock)
const RELEASE_SCRIPT = `
local key = KEYS[1]
local expectedLockId = ARGV[1]
local currentLockId = redis.call('GET', key)
if currentLockId == expectedLockId then
  return redis.call('DEL', key)
else
  return 0
end`;

// Extend: check lockId matches then PEXPIRE (atomic, prevents extending someone else's lock)
const EXTEND_SCRIPT = `
local key = KEYS[1]
local expectedLockId = ARGV[1]
local leaseMs = ARGV[2]
local currentLockId = redis.call('GET', key)
if currentLockId == expectedLockId then
  return redis.call('PEXPIRE', key, leaseMs)
else
  return 0
end`;

// ─── Key helper ───────────────────────────────────────────────────────────

function lockKey(conversationId: string): string {
  return `lock:conversation:${conversationId}`;
}

// ─── Core functions ───────────────────────────────────────────────────────

export async function acquireLock(
  conversationId: string,
  holder: LockHolder | string,
  options?: LockOptions,
): Promise<LockHandle> {
  const leaseMs = options?.leaseMs ?? DEFAULT_LEASE_MS;
  const retryMs = options?.retryMs ?? DEFAULT_RETRY_MS;
  const retryTimeoutMs = options?.retryTimeoutMs ?? DEFAULT_RETRY_TIMEOUT_MS;
  const heartbeatMs = options?.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;

  const key = lockKey(conversationId);
  const lockId = randomUUID();
  const acquiredAt = Date.now();
  const value = JSON.stringify({ lockId, holder, acquiredAt });

  const deadline = acquiredAt + retryTimeoutMs;
  let lastError: Error | null = null;

  while (Date.now() < deadline) {
    try {
      const ok = await redis.set(key, value, { NX: true, PX: leaseMs });
      if (ok) {
        log.debug({ conversationId, holder, lockId }, 'lock acquired');
        return createHandle(conversationId, lockId, holder, acquiredAt, leaseMs, heartbeatMs);
      }

      // Lock held — check if re-entrant (same holder refreshes lease)
      const existing = await redis.get(key);
      if (existing) {
        const parsed = JSON.parse(existing) as { lockId: string; holder: string };
        if (parsed.holder === holder) {
          await redis.pExpire(key, leaseMs);
          log.debug({ conversationId, holder, lockId: parsed.lockId }, 'lock refreshed (re-entrant)');
          return createHandle(conversationId, parsed.lockId, holder, acquiredAt, leaseMs, heartbeatMs);
        }
      }

      await sleep(retryMs);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      log.error({ conversationId, holder, err: lastError }, 'lock acquisition error');
      break;
    }
  }

  const timeoutMs = Date.now() - acquiredAt;
  log.warn({ conversationId, holder, timeoutMs }, 'lock acquisition timed out');
  throw new Error(
    `Lock acquisition failed for conversation ${conversationId} (holder=${holder}): ${lastError?.message ?? 'timeout'}`,
  );
}

export async function releaseLock(
  conversationId: string,
  lockId: string,
): Promise<boolean> {
  const key = lockKey(conversationId);
  try {
    const result = await redis.eval(RELEASE_SCRIPT, { keys: [key], arguments: [lockId] }) as number;
    if (result === 1) {
      log.debug({ conversationId, lockId }, 'lock released');
      return true;
    }
    log.debug({ conversationId, lockId }, 'release: lock not found or holder mismatch');
    return false;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    log.error({ conversationId, lockId, err: error }, 'lock release error');
    return false;
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────

function createHandle(
  conversationId: string,
  lockId: string,
  holder: string,
  acquiredAt: number,
  leaseMs: number,
  heartbeatMs: number,
): LockHandle {
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let released = false;

  const extend = async (): Promise<void> => {
    if (released) return;
    try {
      const key = lockKey(conversationId);
      const result = await redis.eval(EXTEND_SCRIPT, { keys: [key], arguments: [lockId, String(leaseMs)] }) as number;
      if (result === 0) {
        log.warn({ conversationId, lockId, holder }, 'heartbeat extend failed: lock lost');
        stopHeartbeat();
      }
    } catch (err) {
      log.error({ conversationId, lockId, err }, 'heartbeat extend error');
    }
  };

  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    stopHeartbeat();
    await releaseLock(conversationId, lockId);
  };

  const startHeartbeat = (): void => {
    stopHeartbeat();
    heartbeatTimer = setInterval(extend, heartbeatMs);
    // Unref so the timer does not keep the process alive
    if (heartbeatTimer && typeof heartbeatTimer === 'object' && 'unref' in heartbeatTimer) {
      heartbeatTimer.unref();
    }
  };

  const stopHeartbeat = (): void => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  startHeartbeat();

  return { lockId, conversationId, holder, acquiredAt, extend, release };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
