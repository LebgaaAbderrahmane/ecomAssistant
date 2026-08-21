import { Worker, Job } from "bullmq";
import { redisConnection } from "../config";
import { VerificationEmailJob } from "../queues/email.queue";
import sgMail from "@sendgrid/mail";
import { moduleLogger } from "../lib/logger";

const log = moduleLogger('worker.email');

if (!process.env.EMAIL_PROVIDER_API_KEY) {
  throw new Error("Email provider API key cannot be undefined!");
}

if (!process.env.EMAIL_FROM) {
  throw new Error("EMAIL_FROM cannot be undefined!");
}

sgMail.setApiKey(process.env.EMAIL_PROVIDER_API_KEY);


async function sendVerificationEmail(
  job: Job<VerificationEmailJob>
) {
  const { to, shopName, code } = job.data;

  try {
    const result = await sgMail.send({
      to,
      from: {
        email: process.env.EMAIL_FROM!,
        name: shopName,
      },
      subject: "Verify your email address",
      html: buildVerificationEmailHtml({ shopName, code }),
    });

    log.info({ to, statusCode: result[0].statusCode }, 'verification email sent');
  } catch (error: any) {
    log.error({ to, err: error.response?.body ?? error.message }, 'failed sending email');
    throw error;
  }
}

async function sendResetPassword(job: Job<VerificationEmailJob>) {
  const { to, shopName, code } = job.data;

  try {
    const result = await sgMail.send({
      to,
      from: {
        email: process.env.EMAIL_FROM!,
        name: shopName,
      },
      subject: "Reset your password",
      html: buildResetPasswordEmailHtml({ shopName, code }),
    });

    log.info({ to, statusCode: result[0].statusCode }, 'reset password email sent');
  } catch (error: any) {
    log.error({ to, err: error.response?.body ?? error.message }, 'failed sending reset password email');
    throw error;
  }
}


function buildVerificationEmailHtml({
  shopName,
  code,
}: {
  shopName: string;
  code: string;
}): string {

  return `
    <div style="
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      max-width: 500px;
      margin: 40px auto;
      padding: 40px 24px;
      background: #ffffff;
      color: #1a1a1a;
    ">
      
      <h2 style="
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 24px;
        color: #000000;
      ">
        Verify your account
      </h2>


      <p style="
        font-size: 14px;
        line-height: 1.6;
        color: #444444;
        margin-bottom: 32px;
      ">
        Thanks for signing up, 
        <strong>${shopName}</strong>.
        Please use the following code to verify your email.
      </p>


      <div style="
        margin: 32px 0;
        padding: 20px;
        text-align: center;
        font-family: monospace;
        font-size: 32px;
        letter-spacing: 4px;
        font-weight: 700;
        background: #f4f4f5;
        border-radius: 6px;
      ">
        ${code}
      </div>


      <p style="
        font-size: 13px;
        color: #666666;
        margin-bottom: 40px;
      ">
        This code is valid for 
        <strong>10 minutes</strong>.
      </p>


      <hr style="
        border: 0;
        border-top: 1px solid #e4e4e7;
      "/>


      <p style="
        font-size: 12px;
        color: #888888;
      ">
        If you didn't request this email, ignore it.
      </p>

    </div>
  `;
}


function buildResetPasswordEmailHtml({
  shopName,
  code,
}: {
  shopName: string;
  code: string;
}): string {
  return `
    <div style="
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      max-width: 500px;
      margin: 40px auto;
      padding: 40px 24px;
      background: #ffffff;
      color: #1a1a1a;
    ">

      <h2 style="
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 24px;
        color: #000000;
      ">
        Reset your password
      </h2>

      <p style="
        font-size: 14px;
        line-height: 1.6;
        color: #444444;
        margin-bottom: 32px;
      ">
        Hello <strong>${shopName}</strong>,
        please use the following code to reset your password.
      </p>

      <div style="
        margin: 32px 0;
        padding: 20px;
        text-align: center;
        font-family: monospace;
        font-size: 32px;
        letter-spacing: 4px;
        font-weight: 700;
        background: #f4f4f5;
        border-radius: 6px;
      ">
        ${code}
      </div>

      <p style="
        font-size: 13px;
        color: #666666;
        margin-bottom: 40px;
      ">
        This code is valid for <strong>10 minutes</strong>.
      </p>

      <hr style="border: 0; border-top: 1px solid #e4e4e7;" />

      <p style="font-size: 12px; color: #888888;">
        If you didn't request this, ignore it.
      </p>
    </div>
  `;
}

const handler: Record<string, (job: Job<VerificationEmailJob>) => Promise<void>> = {
  "send-verification": sendVerificationEmail,
  "send-reset-password": sendResetPassword,
};

// Worker starts automatically when imported
export const emailWorker = new Worker<VerificationEmailJob>(
  "email",
  (job) => {
    const fn = handler[job.name];
    if (!fn) throw new Error(`Unknown job name: ${job.name}`);
    return fn(job);
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);


emailWorker.on("completed", (job) => {
  log.info({ jobId: job.id }, 'job completed');
});


emailWorker.on("failed", (job, err) => {
  log.error({ jobId: job?.id, err: err.message }, 'job failed');
});
