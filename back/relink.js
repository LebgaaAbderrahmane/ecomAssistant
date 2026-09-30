const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();
const merchantId = 'cmu3wx5sh0004jqbsyr2pfp9s';

const BASE = (process.env.OPENWA_URL || 'http://openwa:3000').replace(/\/+$/, '') + '/api';
const KEY = process.env.OPENWA_API_KEY || 'dev-admin-key';
const SECRET = process.env.OPENWA_WEBHOOK_SECRET || 'whsec_dev';
const INTERNAL_URL = process.env.INTERNAL_URL || 'http://back:3000';

async function req(method, path, body) {
  const headers = { 'X-API-Key': KEY };
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenWA ${method} ${path} -> ${r.status}: ${json.message || ''}`);
  return json.data ?? json;
}

(async () => {
  console.log('OPENWA_BASE', BASE);

  const existing = await prisma.whatsAppSession.findUnique({ where: { merchantId } });
  if (existing) {
    for (const op of ['stopSession', 'logoutSession', 'deleteSession']) {
      try { await req('POST', `/sessions/${existing.sessionId}/${op === 'deleteSession' ? '' : ''}`); } catch { /* not used */ }
    }
    try { await req('POST', `/sessions/${existing.sessionId}/stop`); } catch {}
    try { await req('POST', `/sessions/${existing.sessionId}/logout`); } catch {}
    try { await req('DELETE', `/sessions/${existing.sessionId}`); } catch {}
    await prisma.whatsAppSession.delete({ where: { id: existing.id } });
    console.log('deleted existing DB row + OpenWA session', existing.sessionId);
  }

  try {
    const all = await req('GET', '/sessions');
    for (const s of all || []) {
      if (s.name.startsWith(merchantId)) {
        try { await req('POST', `/sessions/${s.id}/stop`); } catch {}
        try { await req('POST', `/sessions/${s.id}/logout`); } catch {}
        try { await req('DELETE', `/sessions/${s.id}`); } catch {}
        console.log('cleaned stale session', s.id);
      }
    }
  } catch (e) { console.log('stale cleanup skipped:', e.message); }

  const name = `${merchantId}-${Date.now()}`;
  const session = await req('POST', '/sessions', { name });
  console.log('created session', JSON.stringify({ id: session.id, name: session.name, status: session.status }));
  try { await req('POST', `/sessions/${session.id}/start`); } catch (e) { console.log('start warn', e.message); }

  let qr = null;
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try { qr = await req('GET', `/sessions/${session.id}/qr`); if (qr) break; } catch {}
  }
  const st = await req('GET', `/sessions/${session.id}`).catch(() => null);
  const sessionReady = st && (st.status === 'ready' || st.status === 'connected');
  console.log('session status now:', st && st.status, 'qr generated:', !!qr);

  const webhookUrl = `${INTERNAL_URL.replace(/\/+$/, '')}/whatsapp/webhook`;
  await req('POST', `/sessions/${session.id}/webhooks`, {
    url: webhookUrl,
    events: ['message.received', 'message.sent', 'session.status'],
    secret: SECRET,
  });
  console.log('registered webhook', webhookUrl);

  const sessionStatus = sessionReady ? 'connected' : 'connecting';
  await prisma.whatsAppSession.create({
    data: { merchantId, sessionId: session.id, status: sessionStatus },
  });
  console.log('DB row created', { merchantId, sessionId: session.id, status: sessionStatus });

  if (qr) {
    const raw = qr.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync('/tmp/qr_raw.txt', raw);
    console.log('QR written to /tmp/qr_raw.txt');
  } else {
    console.log('NO QR (session already linked? if phone still paired, re-scan needed via dashboard)');
  }
  await prisma.$disconnect();
})().catch(async e => { console.error('FAILED:', e.message); try { await prisma.$disconnect(); } catch {} process.exit(1); });