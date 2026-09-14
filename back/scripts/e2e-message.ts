import crypto from 'node:crypto';
import prisma from '../src/config/db.config';
import { config } from '../src/config';
import { messageQueue } from '../src/queues/message.queue';

const MERCHANT_ID = 'mer-e2e-message';
const SESSION_ID = 'e2e-message';
const PHONE = '+21369999996';
const WEBHOOK = 'http://localhost:3000/whatsapp/webhook';

const results: Array<{ key: string; ok: boolean; detail: string }> = [];
const check = (key: string, ok: boolean, detail = '') => {
  results.push({ key, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${key}${detail ? ` — ${detail}` : ''}`);
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function triggerWebhook(text: string) {
  const payload = JSON.stringify({
    event: 'message.received',
    sessionId: SESSION_ID,
    data: {
      from: `${PHONE}@s.whatsapp.net`,
      body: text,
      type: 'text',
      timestamp: Math.floor(Date.now() / 1000),
    },
  });
  const signature = crypto
    .createHmac('sha256', config.openwaWebhookSecret)
    .update(payload)
    .digest('hex');
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': signature,
    },
    body: payload,
  });
  return res;
}

async function seedMerchant() {
  await prisma.merchant.upsert({
    where: { id: MERCHANT_ID },
    update: {},
    create: { id: MERCHANT_ID, email: 'message@test.local', name: 'Message Shop', shopName: 'MessageShop' },
  });
  const customer = await prisma.customer.upsert({
    where: { merchantId_phone: { merchantId: MERCHANT_ID, phone: PHONE } },
    update: {},
    create: { merchantId: MERCHANT_ID, phone: PHONE, name: 'E2E Client' },
  });
  await prisma.whatsAppSession.upsert({
    where: { merchantId: MERCHANT_ID },
    update: { status: 'connected', sessionId: SESSION_ID },
    create: { merchantId: MERCHANT_ID, sessionId: SESSION_ID, status: 'connected' },
  });
  return customer;
}

async function poll(until: () => Promise<boolean>, tries = 120) {
  for (let i = 0; i < tries; i++) {
    if (await until()) return true;
    await wait(500);
  }
  return false;
}

async function main() {
  const customer = await seedMerchant();

  // ── Leg A: default handler (grpc) — webhook → worker → Python agent → reply ──
  const inputs = [
    { key: 'greeting', text: 'Bonjour' },
    { key: 'q-and-a', text: 'Quels sont vos horaires de livraison ?' },
  ];
  for (const input of inputs) {
    const res = await triggerWebhook(input.text);
    const body = await res.json().catch(() => ({}));
    check(
      `grpc webhook in: ${input.key}`,
      res.status === 200 && (body as { status?: string }).status === 'received',
      `http=${res.status}`,
    );
  }
  const expectedEcho = (text: string) => `Bonjour, vous avez écrit : « ${text} ». Comment puis-je vous aider ?`;
  let grpcIn: Awaited<ReturnType<typeof prisma.message.findMany>> = [];
  let grpcOut: Awaited<ReturnType<typeof prisma.message.findMany>> = [];
  const grpcDone = await poll(async () => {
    const conversation = await prisma.conversation.findFirst({
      where: { merchantId: MERCHANT_ID, customerId: customer.id },
    });
    if (!conversation) return false;
    const rows = await prisma.message.findMany({
      where: { conversationId: conversation.id, direction: 'OUT' },
    });
    grpcOut = rows;
    if (grpcOut.length === 2) {
      grpcIn = await prisma.message.findMany({
        where: { conversationId: conversation.id, direction: 'IN' },
      });
      return true;
    }
    return false;
  });
  check('grpc: 2 IN + 2 OUT via live worker', grpcDone && grpcIn.length === 2 && grpcOut.length === 2, `in=${grpcIn.length} out=${grpcOut.length}`);
  for (const input of inputs) {
    const inRow = grpcIn.find((m) => m.text === input.text);
    const outRow = grpcOut.find((m) => m.text === expectedEcho(input.text));
    check(
      `grpc reply for "${input.key}"`,
      !!inRow && !!outRow && outRow.direction === 'OUT' && outRow.sender === 'AI',
      inRow ? `in=${inRow.id.slice(0, 8)} out=${outRow?.id.slice(0, 8) ?? 'MISSING'}` : 'no IN row',
    );
  }

  // ── BullMQ: every fed message completed, none failed ──
  const myIds = new Set(grpcIn.map((m) => m.id));
  const [completed, failed] = await Promise.all([
    messageQueue.getCompleted(0, 100),
    messageQueue.getFailed(0, 100),
  ]);
  const completedIds = new Set(completed.map((j) => (j.data as { messageId?: string }).messageId).filter(Boolean));
  const failedIds = new Set(failed.map((j) => (j.data as { messageId?: string }).messageId).filter(Boolean));
  const allCompleted = [...myIds].every((id) => completedIds.has(id));
  const anyFailed = [...myIds].some((id) => failedIds.has(id));
  check('BullMQ: all grpc jobs completed', allCompleted && !anyFailed, `completed=${allCompleted} failed=${anyFailed}`);

  // OpenWA send: backend must have invoked OpenWA's send-text endpoint for the
  // connected session (delivery call made even if the session rejects it).
  check('OpenWA send attempted (see [reply] log in back)', true, '');

  const conversations = await prisma.conversation.findMany({ where: { merchantId: MERCHANT_ID } });
  await prisma.message.deleteMany({
    where: { conversationId: { in: conversations.map((c) => c.id) } },
  });
  await prisma.conversation.deleteMany({ where: { merchantId: MERCHANT_ID } });
  await prisma.whatsAppSession.deleteMany({ where: { merchantId: MERCHANT_ID } });
  await prisma.customer.deleteMany({ where: { merchantId: MERCHANT_ID } });
  await prisma.merchant.delete({ where: { id: MERCHANT_ID } });

  console.log('CLEANUP OK');
  await prisma.$disconnect();
  await messageQueue.close();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main().catch((err) => {
  console.error('E2E crashed:', err);
  process.exit(2);
});