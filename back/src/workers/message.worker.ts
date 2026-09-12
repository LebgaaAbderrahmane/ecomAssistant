import { Worker, Job } from 'bullmq';
import { config, redisConnection } from '../config';
import { MessageJobData } from '../queues/message.queue';
import { dispatchInboundMessage } from '../modules/ai/messageDispatcher';
import { handleMessageViaAgent } from '../modules/ai/agent.bridge';
import { processMessage } from '../modules/ai/agent.service';

export const messageWorker = new Worker<MessageJobData>(
  "message",
  async (job: Job<MessageJobData>) => {
    await dispatchInboundMessage(
      job.data.messageId,
      { grpc: handleMessageViaAgent, legacy: processMessage },
      config.messageHandler as 'grpc' | 'legacy',
    );
  },
  { connection: redisConnection, concurrency: 5 }
);

messageWorker.on('completed', (job) => {
  console.log(`[worker] message ${job.data.messageId} processed`);
});

messageWorker.on('failed', (job, err) => {
  console.error(`[worker] message ${job?.data.messageId} failed:`, err);
});