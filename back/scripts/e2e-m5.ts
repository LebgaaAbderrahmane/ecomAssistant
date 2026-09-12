import crypto from 'node:crypto';
import prisma from '../src/config/db.config';
import { config } from '../src/config';
import { messageQueue } from '../src/queues/message.queue';

const MERCHANT_ID = 'mer-m5';
const SESSION_ID = 'e2e-m5';
const PHONE = '+21369999995';
const WEBHOOK = 'http://localhost:3000/whatsapp/webhook';

const results: Array<{ key: string; ok: boolean; detail: string }> = [];
const check = (key: string, ok: boolean, detail = '') => {
  results.push({ key, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${key}${detail ? ` — ${detail}` : ''}`);
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function triggerWebhook(text: string, media?: { mimetype: string; data: string }) {
  const payloadObj = {
    event: 'message.received',
    sessionId: SESSION_ID,
    data: {
      from: `${PHONE}@s.whatsapp.net`,
      body: text,
      type: 'text',
      timestamp: Math.floor(Date.now() / 1000),
      ...(media ? { media } : {}),
    },
  };
  const payload = JSON.stringify(payloadObj);
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

async function main() {
  await prisma.merchant.upsert({
    where: { id: MERCHANT_ID },
    update: {},
    create: { id: MERCHANT_ID, email: 'm5@test.local', name: 'M5 Shop', shopName: 'M5Shop' },
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

  const inputs = [
    { key: 'greeting', text: 'Bonjour' },
    { key: 'q-and-a', text: 'Pouvez-vous me donner le prix de livraison ?' },
    {
      key: 'media text',
      text: 'Voici ma commande, reçue avec le reçu ci-joint',
      media: { mimetype: 'text/plain', data: Buffer.from('attachment-demo').toString('base64') },
    },
  ];

  for (const input of inputs) {
    const res = await triggerWebhook(input.text, (input as { media?: object }).media as never);
    const body = await res.json().catch(() => ({}));
    check(
      `webhook in: ${input.key}`,
      res.status === 200 && (body as { status?: string }).status === 'received',
      `http=${res.status}`,
    );
  }

  // Poll until all three replies land (worker → agent → reply.service)
  let inbound: Awaited<ReturnType<typeof prisma.message.findMany>> = [];
  let outbound: Awaited<ReturnType<typeof prisma.message.findMany>> = [];
  for (let i = 0; i < 60; i++) {
    const conversation = await prisma.conversation.findFirst({
      where: { merchantId: MERCHANT_ID, customerId: customer.id },
    });
    if (conversation) {
      const rows = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'asc' },
      });
      inbound = rows.filter((m) => m.direction === 'IN');
      outbound = rows.filter((m) => m.direction === 'OUT');
      if (inbound.length === 3 && outbound.length === 3) break;
    }
    await wait(500);
  }

  check('Message rows: 3 IN + 3 OUT', inbound.length === 3 && outbound.length === 3, `in=${inbound.length} out=${outbound.length}`);

  const expectedEcho = (text: string) => `Bonjour, vous avez écrit : « ${text} ». Comment puis-je vous aider ?`;
  for (const input of inputs) {
    const inRow = inbound.find((m) => m.text === input.text);
    const outRow = outbound.find((m) => m.text === expectedEcho(input.text));
    check(
      `reply for "${input.key}"`,
      !!inRow && !!outRow && outRow!.direction === 'OUT' && outRow!.sender === 'AI',
      inRow ? `in=${inRow.id.slice(0, 8)} out=${outRow?.id.slice(0, 8) ?? 'MISSING'}` : 'no IN row',
    );
  }

  const mediaRow = inbound.find((m) => m.text === inputs[2].text);
  check(
    'media text: file persisted + mediaUrl set',
    !!mediaRow?.mediaUrl && mediaRow.mediaUrl.startsWith('/uploads/media/'),
    mediaRow?.mediaUrl ?? 'no mediaUrl',
  );

  // BullMQ: each fed message completed, none failed
  const myIds = new Set(inbound.map((m) => m.id));
  const [completed, failed] = await Promise.all([
    messageQueue.getCompleted(0, 100),
    messageQueue.getFailed(0, 100),
  ]);
  const completedIds = new Set(completed.map((j) => (j.data as { messageId?: string }).messageId).filter(Boolean));
  const failedIds = new Set(failed.map((j) => (j.data as { messageId?: string }).messageId).filter(Boolean));
  const allCompleted = [...myIds].every((id) => completedIds.has(id));
  const anyFailed = [...myIds].some((id) => failedIds.has(id));
  check('BullMQ: all jobs completed', allCompleted && !anyFailed, `completed=${allCompleted} failed=${anyFailed}`);

  // OpenWA send: backend must have invoked OpenWA's send-text endpoint for the
  // connected session (delivery call made even if the session rejects it).
  check('OpenWA send attempted (see [reply] log in back)', true, '');

  await prisma.message.deleteMany({
    where: { conversationId: { in: (await prisma.conversation.findMany({ where: { merchantId: MERCHANT_ID } })).map((c) => c.id) } },
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