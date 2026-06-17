import { Queue } from "bullmq";
import { redisConnection } from "../config";

// Define individual payload structures
export interface VerificationEmailPayload {
  to: string;
  shopName: string;
  code: string;
}

export interface ResetPasswordEmailPayload {
  to: string;
  shopName: string;
  code: string;
}

// Combine into a single type union for the queue
export type EmailJobDataType = 
  | { name: "send-verification"; data: VerificationEmailPayload }
  | { name: "send-reset-password"; data: ResetPasswordEmailPayload };

// Extract just the data part for the generic Queue type declaration
type QueueData = VerificationEmailPayload | ResetPasswordEmailPayload;

export const emailQueue = new Queue<QueueData>("email", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,                    
    backoff: {
      type: "exponential",
      delay: 5000,                    // 5s → 10s → 20s
    },
    removeOnComplete: true,           
    removeOnFail: false,              
  },
});