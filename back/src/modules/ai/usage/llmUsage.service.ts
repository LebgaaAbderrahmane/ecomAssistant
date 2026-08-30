import prisma from '../../../config/db.config';
import { moduleLogger } from '../../../lib/logger';

// ─── LLM token usage persistence ──────────────────────────────────────────
// Records one row per LLM call so token consumption can be monitored in the
// Prisma UI. Writes are NON-BLOCKING: the caller never awaits persistence, so
// token accounting never adds latency to the reply path. Rows are buffered in
// memory and flushed on an interval; a bounded queue guarantees we never grow
// unbounded under a burst, and a process-exit flush reduces loss window.

export interface LlmUsageRecord {
  merchantId?: string;
  conversationId?: string;
  messageId?: string;
  purpose?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  attempt: number;
  success: boolean;
}

const FLUSH_INTERVAL_MS = 2000;
const MAX_QUEUE_SIZE = 1000;
const MAX_INSERT_BATCH = 200;

const log = moduleLogger('llm.usage');

let queue: LlmUsageRecord[] = [];
let flushing = false;

function persist(records: LlmUsageRecord[]): void {
  if (records.length === 0) return;

  // Not awaited at the call site; failures are logged, never thrown to callers.
  prisma.llmUsage
    .createMany({ data: records })
    .catch((err) => log.error({ err, count: records.length }, 'failed to persist llm usage'));
}

export function recordLlmUsage(record: LlmUsageRecord): void {
  queue.push(record);

  if (queue.length >= MAX_QUEUE_SIZE) {
    flushLlmUsage();
  }
}

export function flushLlmUsage(): void {
  if (flushing || queue.length === 0) return;
  flushing = true;

  // splice() removes the batch from the queue, leaving any remainder in place.
  const batch = queue.splice(0, MAX_INSERT_BATCH);

  persist(batch);

  flushing = false;
  if (queue.length > 0) flushLlmUsage();
}

// Flush periodically so records reach the DB shortly after the call.
const interval = setInterval(() => flushLlmUsage(), FLUSH_INTERVAL_MS);
// Reduce the on-crash loss window. Keep the process alive while a flush runs;
// persist() is fire-and-forget, so `call()` registers the pending writes.
interval.unref();

// Flush remaining records on a clean shutdown.
if (typeof process !== 'undefined') {
  for (const event of ['exit', 'SIGINT', 'SIGTERM'] as const) {
    process.once(event, () => {
      try {
        flushLlmUsage();
      } catch {
        // best-effort on shutdown
      }
    });
  }
}
