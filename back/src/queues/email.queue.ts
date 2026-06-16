import { Queue } from "bullmq";
import { redisConnection } from "../config";

export interface VerificationEmailJob {
  to: string;
  shopName: string;
  code: string;
}

// One queue for all outgoing emails — job name distinguishes the type
export const emailQueue = new Queue<VerificationEmailJob>("email", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,                       
    backoff: {
      type: "exponential",
      delay: 5000,                     // 5s → 10s → 20s
    },
    removeOnComplete: true,            // Clean up completed jobs from Redis
    removeOnFail: false,               // Keep failed jobs for inspection
  },
});