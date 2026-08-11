import { Worker, Job } from 'bullmq';
import { redisConnection } from '../config';
import { Layer2JobData } from '../queues/layer2.queue';
import { processDeferredLayer2 } from '../modules/ai/agent.service';

export const layer2Worker = new Worker<Layer2JobData>(
  "agent-layer2",
  async (job: Job<Layer2JobData>) => {
    await processDeferredLayer2(job.data.messageId);
  },
  { connection: redisConnection, concurrency: 5 }
);

layer2Worker.on('completed', (job) => {
  console.log(`[worker] layer2 ${job.data.messageId} processed`);
});

layer2Worker.on('failed', (job, err) => {
  console.error(`[worker] layer2 ${job?.data.messageId} failed:`, err);
});
