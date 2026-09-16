import { Queue } from 'bullmq';
import { redisConnection } from '../config';
import {
  MESSAGE_JOB_ATTEMPTS,
  MESSAGE_JOB_BACKOFF,
  MESSAGE_JOB_REMOVE_ON_COMPLETE,
  MESSAGE_JOB_REMOVE_ON_FAIL,
} from './messageQueueOptions';

export const messageQueue = new Queue("message", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: MESSAGE_JOB_ATTEMPTS,
    backoff: MESSAGE_JOB_BACKOFF,
    removeOnComplete: MESSAGE_JOB_REMOVE_ON_COMPLETE,
    removeOnFail: MESSAGE_JOB_REMOVE_ON_FAIL,
  },
});

export type MessageJobData = { messageId: string };

export const enqueueMessageJob = async (messageId: string) => {
  await messageQueue.add('process-message', { messageId } satisfies MessageJobData);
};