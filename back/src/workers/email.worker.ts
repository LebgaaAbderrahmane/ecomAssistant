import { Worker, Job } from "bullmq";
import { redisConnection } from "../config";
import sgMail from "@sendgrid/mail";

if (!process.env.EMAIL_PROVIDER_API_KEY || !process.env.EMAIL_FROM) {
  throw new Error("Email provider environment variables are missing!");
}

sgMail.setApiKey(process.env.EMAIL_PROVIDER_API_KEY);

// --- Core Worker Handler ---
export const emailWorker = new Worker(
  "email",
  async (job: Job) => {
    switch (job.name) {
      case "send-verification":
        await handleVerificationEmail(job);
        break;

      case "send-reset-password":
        await handleResetPasswordEmail(job);
        break;

      default:
        console.warn(`[EmailWorker] Unknown job name encountered: ${job.name}`);
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

// --- Individual Job Handlers ---

async function handleVerificationEmail(job: Job) {
  const { to, shopName, code } = job.data;
  try {
    await sgMail.send({
      to,
      from: { email: process.env.EMAIL_FROM!, name: shopName },
      subject: "Verify your email address",
      html: buildVerificationEmailHtml(shopName, code),
    });
    console.log(`[EmailWorker] Verification email sent to ${to}`);
  } catch (error: any) {
    console.error(`[EmailWorker] Verification email failed for ${to}`, error.response?.body ?? error.message);
    throw error;
  }
}

async function handleResetPasswordEmail(job: Job) {
  const { to, shopName, code } = job.data;
  try {
    await sgMail.send({
      to,
      from: { email: process.env.EMAIL_FROM!, name: "Secure Shop System" },
      subject: "Reset your password",
      html: buildResetPasswordEmailHtml(shopName, code),
    });
    console.log(`[EmailWorker] Password reset email sent to ${to}`);
  } catch (error: any) {
    console.error(`[EmailWorker] Password reset email failed for ${to}`, error.response?.body ?? error.message);
    throw error;
  }
}

// --- HTML Templates ---

function buildVerificationEmailHtml(shopName: string, code: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 500px; margin: 40px auto; padding: 24px; color: #1a1a1a;">
      <h2>Verify your account</h2>
      <p>Thanks for signing up, <strong>${shopName}</strong>. Use the code below to verify your email.</p>
      <div style="margin: 32px 0; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; background: #f4f4f5; border-radius: 6px; letter-spacing: 4px;">
        ${code}
      </div>
      <p style="font-size: 13px; color: #666666;">Valid for 10 minutes.</p>
    </div>
  `;
}

function buildResetPasswordEmailHtml(shopName: string, code: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 500px; margin: 40px auto; padding: 24px; color: #1a1a1a;">
      <h2 style="color: #dc2626;">Reset Your Password</h2>
      <p>Hello <strong>${shopName}</strong>,</p>
      <p>We received a request to reset your password. Use the verification code below to complete the setup:</p>
      <div style="margin: 32px 0; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; background: #fef2f2; border: 1px solid #fee2e2; color: #dc2626; border-radius: 6px; letter-spacing: 4px;">
        ${code}
      </div>
      <p style="font-size: 13px; color: #666666;">This code is private and expires in 10 minutes. If you didn't request this change, you can safely ignore this mail.</p>
    </div>
  `;
}

// --- Listeners ---
emailWorker.on("completed", (job) => console.log(`[EmailWorker] Job ${job.id} split-completed (${job.name})`));
emailWorker.on("failed", (job, err) => console.error(`[EmailWorker] Job ${job?.id} failed:`, err.message));