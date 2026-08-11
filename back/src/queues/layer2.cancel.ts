import type { Layer2JobData } from './layer2.queue';
import type { JobType } from 'bullmq';

export type PendingLayer2Job = {
  data: Layer2JobData;
  remove: () => Promise<unknown>;
};

export type PendingLayer2JobSource = {
  getJobs: (types?: JobType[]) => Promise<PendingLayer2Job[]>;
};

// Pure cancellation logic, decoupled from the BullMQ queue instance so it can
// be unit-tested without a Redis connection. The queue's pending (delayed +
// waiting) jobs are filtered by conversation and removed.
export const cancelPendingLayer2JobsFrom = async (
  conversationId: string,
  queue: PendingLayer2JobSource,
): Promise<number> => {
  const jobs = await queue.getJobs(['delayed', 'waiting']);
  const pending = jobs.filter((job) => job.data.conversationId === conversationId);
  await Promise.all(pending.map((job) => job.remove()));
  return pending.length;
};
