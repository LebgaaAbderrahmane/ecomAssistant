import { Worker, Job } from 'bullmq';
import { redisConnection } from '../config';
import { MessageJobData } from '../queues/message.queue';
import { processMessage } from '../modules/ai/agent.service';

export const messageWorker = new Worker<MessageJobData>(
  "message",
  async (job: Job<MessageJobData>) => {
    await processMessage(job.data.messageId);
  },
  { connection: redisConnection, concurrency: 5 }
);

messageWorker.on('completed', (job) => {
  console.log(`[worker] message ${job.data.messageId} processed`);
});

messageWorker.on('failed', (job, err) => {
  console.error(`[worker] message ${job?.data.messageId} failed:`, err);
});