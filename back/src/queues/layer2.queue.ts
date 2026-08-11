import { Queue } from 'bullmq';
import { redisConnection } from '../config';

export const LAYER2_DELAY_MS = 30_000;

export type Layer2JobData = {
  messageId: string;
  conversationId: string;
};

export const layer2Queue = new Queue<Layer2JobData>('agent-layer2', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export const enqueueLayer2Job = async (
  messageId: string,
  conversationId: string,
  kind: string,
) => {
  await layer2Queue.add(kind, { messageId, conversationId } satisfies Layer2JobData, {
    jobId: `layer2-${messageId}`,
    delay: LAYER2_DELAY_MS,
  });
};

export const cancelPendingLayer2Jobs = async (
  conversationId: string,
): Promise<number> => {
  const jobs = await layer2Queue.getJobs(['delayed', 'waiting']);
  const pending = jobs.filter((job) => job.data.conversationId === conversationId);
  await Promise.all(pending.map((job) => job.remove()));
  return pending.length;
};
