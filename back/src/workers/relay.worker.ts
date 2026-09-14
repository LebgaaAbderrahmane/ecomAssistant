import { Worker, Job } from 'bullmq';
import { redisConnection } from '../config';
import { MessageJobData } from '../queues/message.queue';
import { handleMessageViaAgent } from '../modules/ai/agent.bridge';

export const relayWorker = new Worker<MessageJobData>(
  "message",
  async (job: Job<MessageJobData>) => {
    await handleMessageViaAgent(job.data.messageId);
  },
  { connection: redisConnection, concurrency: 5 }
);

relayWorker.on('completed', (job) => {
  console.log(`[worker] message ${job.data.messageId} processed`);
});

relayWorker.on('failed', (job, err) => {
  console.error(`[worker] message ${job?.data.messageId} failed:`, err);
});