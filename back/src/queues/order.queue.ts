import { Queue } from 'bullmq';
import { redisConnection } from '../config';

export const orderQueue = new Queue('order-confirmation', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export type OrderJobData = { orderId: string };

export const enqueueOrderJob = async (orderId: string) => {
  // The job id is the order id, so adding the same order again is ignored.
  await orderQueue.add('send-confirmation', { orderId } satisfies OrderJobData, { jobId: orderId });
};