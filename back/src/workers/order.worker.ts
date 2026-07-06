import { Worker, Job } from 'bullmq';
import { redisConnection } from '../config';
import { OrderJobData } from '../queues/order.queue';
import { sendOrderConfirmation } from '../modules/orders/orderConfirmation.service';

export const orderWorker = new Worker<OrderJobData>(
  'order-confirmation',
  async (job: Job<OrderJobData>) => {
    await sendOrderConfirmation(job.data.orderId);
  },
  { connection: redisConnection, concurrency: 5 }
);

orderWorker.on('completed', (job) => {
  console.log(`[order-worker] order ${job.data.orderId} confirmation sent`);
});

orderWorker.on('failed', (job, err) => {
  console.error(`[order-worker] order ${job?.data.orderId} failed:`, err);
});