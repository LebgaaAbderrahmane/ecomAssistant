import { Worker, Job } from 'bullmq';
import { config, redisConnection } from '../config';
import { MessageJobData } from '../queues/message.queue';
import { processMessage } from '../modules/ai/agent.service';
import { handleMessageViaAgent } from '../modules/ai/agent.bridge';

export const messageWorker = new Worker<MessageJobData>(
  "message",
  async (job: Job<MessageJobData>) => {
    if (config.messageHandler === 'grpc') {
      await handleMessageViaAgent(job.data.messageId);
    } else {
      await processMessage(job.data.messageId);
    }
  },
  { connection: redisConnection, concurrency: 5 }
);

messageWorker.on('completed', (job) => {
  console.log(`[worker] message ${job.data.messageId} processed`);
});

messageWorker.on('failed', (job, err) => {
  console.error(`[worker] message ${job?.data.messageId} failed:`, err);
});