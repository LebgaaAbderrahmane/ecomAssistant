import { Worker, Job } from 'bullmq';
import { redisConnection } from '../config';
import { Layer2JobData } from '../queues/layer2.queue';
import { processDeferredLayer2 } from '../modules/ai/agent.service';
import { moduleLogger } from '../lib/logger';

const log = moduleLogger('worker.layer2');

export const layer2Worker = new Worker<Layer2JobData>(
  "agent-layer2",
  async (job: Job<Layer2JobData>) => {
    await processDeferredLayer2(job.data.messageId);
  },
  { connection: redisConnection, concurrency: 5 }
);

layer2Worker.on('completed', (job) => {
  log.info({ messageId: job.data.messageId }, 'layer2 processed');
});

layer2Worker.on('failed', (job, err) => {
  log.error({ messageId: job?.data.messageId, err }, 'layer2 failed');
});
