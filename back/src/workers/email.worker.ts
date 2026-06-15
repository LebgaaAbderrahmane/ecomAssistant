import { Worker, Job } from "bullmq";
import { Resend } from "resend";
import { redisConnection } from "../config";
import { VerificationEmailJob } from "../queues/email.queue";

console.log("the resend key is: ", process.env.RESEND_API_KEY)
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendVerificationEmail(job: Job<VerificationEmailJob>) {
  const { to, verificationUrl, shopName } = job.data;

  const result = await resend.emails.send({
  from: process.env.EMAIL_FROM ?? "monboarding@resend.dev",
  to,
  subject: "Verify your email address",
  html: buildVerificationEmailHtml({ shopName, verificationUrl }),
});

console.log("Resend response:", result);

  console.log(`[EmailWorker] Verification email sent to ${to}`);
}

function buildVerificationEmailHtml({
  shopName,
  verificationUrl,
}: {
  shopName: string;
  verificationUrl: string;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: auto; padding: 32px;">
      <h2>Welcome to the platform, ${shopName}!</h2>
      <p>Please verify your email address by clicking the button below.</p>
      <p>This link expires in <strong>24 hours</strong>.</p>
      <a
        href="${verificationUrl}"
        style="
          display: inline-block;
          margin-top: 16px;
          padding: 12px 24px;
          background-color: #4f46e5;
          color: #fff;
          text-decoration: none;
          border-radius: 6px;
          font-weight: bold;
        "
      >
        Verify Email
      </a>
      <p style="margin-top: 24px; color: #6b7280; font-size: 13px;">
        If you didn't create an account, you can safely ignore this email.
      </p>
    </div>
  `;
}

// The worker — starts automatically when this file is imported
export const emailWorker = new Worker<VerificationEmailJob>(
  "email",
  sendVerificationEmail,
  {
    connection: redisConnection,
    concurrency: 5, // Process up to 5 email jobs in parallel
  }
);

emailWorker.on("completed", (job) => {
  console.log(`[EmailWorker] Job ${job.id} completed`);
});

emailWorker.on("failed", (job, err) => {
  console.error(`[EmailWorker] Job ${job?.id} failed:`, err.message);
});