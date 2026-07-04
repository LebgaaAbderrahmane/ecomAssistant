import { Queue } from 'bullmq';
import { redisConnection } from '../config';

export const messageQueue = new Queue("message", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export type MessageJobData = { messageId: string };

export const enqueueMessageJob = async (messageId: string) => {
  await messageQueue.add('process-message', { messageId } satisfies MessageJobData);
};