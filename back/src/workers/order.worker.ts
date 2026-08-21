import { Worker, Job } from 'bullmq';
import { redisConnection } from '../config';
import { OrderJobData } from '../queues/order.queue';
import { sendOrderConfirmation } from '../modules/orders/orderConfirmation.service';
import { moduleLogger } from '../lib/logger';

const log = moduleLogger('worker.order');

export const orderWorker = new Worker<OrderJobData>(
  'order-confirmation',
  async (job: Job<OrderJobData>) => {
    await sendOrderConfirmation(job.data.orderId);
  },
  { connection: redisConnection, concurrency: 5 }
);

orderWorker.on('completed', (job) => {
  log.info({ orderId: job.data.orderId }, 'order confirmation sent');
});

orderWorker.on('failed', (job, err) => {
  log.error({ orderId: job?.data.orderId, err }, 'order failed');
});
