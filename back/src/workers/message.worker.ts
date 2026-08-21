import { Worker, Job } from 'bullmq';
import { redisConnection } from '../config';
import { MessageJobData } from '../queues/message.queue';
import { processMessage } from '../modules/ai/agent.service';
import { msgLogger } from '../lib/logger';

export const messageWorker = new Worker<MessageJobData>(
  "message",
  async (job: Job<MessageJobData>) => {
    await processMessage(job.data.messageId);
  },
  { connection: redisConnection, concurrency: 5 }
);

messageWorker.on('completed', (job) => {
  msgLogger({ conversationId: 'unknown', messageId: job.data.messageId }).info('message processed');
});

messageWorker.on('failed', (job, err) => {
  msgLogger({ conversationId: 'unknown', messageId: job?.data.messageId ?? 'unknown' }).error({ err }, 'message failed');
});
