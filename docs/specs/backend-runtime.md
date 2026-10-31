# Spec: backend runtime

- **Status:** proposed
- **Related:** `docs/REWORK_PLAN.md` Phase 3, issues #44 #46 #48 #50
- **Scope:** `back/` process model, queues, inbound and outbound message paths, migrations, configuration

## 1. Problem

`back` is one process that runs the HTTP API, three BullMQ workers, and the gRPC `ToolService`. One slow media transcription or one stuck agent call competes with API latency, and the process cannot scale by role.

The message path has three ordering and delivery problems:

- Worker concurrency is 5 with no per-conversation key, so two messages from the same customer can be processed out of order.
- `deliverAssistantReply` writes the `OUT` row first and sends second. A failed send leaves a row that says the message was delivered.
- The webhook does media work (write file, transcribe, caption) before returning 200, and the body limit drops most media, so OpenWA retries.

## 2. Target process model

| Process | Entrypoint | Runs | Scales on |
|---|---|---|---|
| `back-api` | `src/index.api.ts` | Express HTTP, gRPC `ToolService`, auth, read paths | request rate |
| `back-worker` | `src/index.worker.ts` | message, media, outbox, follow-up, email workers | queue depth |
| `back-migrate` | one-shot | `prisma migrate deploy` | deploy only |

Same image, three commands. No `tsx watch`, no `prisma db push`, no bind mounts in production.

Rules:

- Only `back-api` serves HTTP and gRPC.
- Only `back-worker` consumes queues.
- Workers do not import the Express app; the app does not start workers.
- Shared code lives in modules, not in entrypoints.
- Graceful shutdown: stop accepting, drain in-flight jobs up to 25s, close Redis/Postgres.

## 3. Queue topology

```
inbound.message    (conversationId as job key)  -> agent turn -> outbox
inbound.media      (messageId)                  -> download, store, transcribe/caption -> update message
outbound.message   (outbox row id)              -> WhatsApp send -> update outbox
followup.schedule  (conversationId)             -> delayed jobs
email.*            (existing)                   -> unchanged
```

Ordering:

- `inbound.message` jobs use `jobId = conversationId` with BullMQ's `groupKey`/custom lock, or a Redis lock `conv:{id}` with a short TTL. Simplest correct option: a per-conversation Redis lock acquired by the worker, plus `attempts` with backoff; a job that cannot acquire waits and retries.
- Ordering is per conversation, not global. Different conversations run in parallel.
- A retry must not run a turn twice. The existing turn guard + saved result + idempotency key stay. The queue lock is an addition, not a replacement.

## 4. Inbound webhook

Target sequence:

1. Verify signature over the **raw** body. Fail closed.
2. Persist the raw event (`WebhookEvent` table: provider, external id, payload, receivedAt, status).
3. Deduplicate on provider event/message id. Duplicate → 200, no enqueue.
4. Persist the message row (metadata only) and enqueue `inbound.message` / `inbound.media`.
5. Return 200.

Rules:

- No file writes, no transcription, no captioning, no agent call before the ACK.
- p95 ACK < 100ms.
- Media job downloads from the provider, stores to object storage or a bounded local volume, then updates the message and enqueues the turn.
- Body limit is raised only for the webhook route, and the raw buffer is kept for signature verification.
- A failed media job does not block the text turn; the turn sees `media: pending` and can ask the customer to resend.

## 5. Outbox

New table:

```prisma
model OutboundMessage {
  id                String   @id @default(cuid())
  merchantId        String
  conversationId    String
  messageId         String?  // Message row, created on send
  body              String
  status            OutboxStatus // QUEUED | SENDING | SENT | FAILED | CANCELLED
  attempts          Int      @default(0)
  lastError         String?
  providerMessageId String?
  scheduledAt       DateTime @default(now())
  sentAt            DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  @@index([status, scheduledAt])
  @@index([conversationId])
}
```

Rules:

- The agent turn writes outbox rows; it does not call WhatsApp.
- The outbox worker sends, then marks `SENT` and stores the provider id.
- Failure → `FAILED` with error, retry with exponential backoff up to N attempts, then dead-letter + merchant notification.
- `Message` rows for outbound are created only when the outbox row reaches `SENT` (or created as `QUEUED` with a status column; pick one and use it everywhere).
- The merchant transcript shows real state: queued, sent, failed. No optimistic "delivered".
- Idempotency: one outbox row per intended message; retries reuse it.

## 6. Data and migrations

- `prisma migrate deploy` only. `db push` removed from Dockerfiles, scripts, and docs.
- Baseline: generate migration zero from the current schema, mark it applied on existing databases, then add forward migrations.
- Every migration is tested on an empty DB and on a restored copy.
- Add the missing `waJid` migration and any drift found by `prisma migrate diff`.
- Remove dead columns/models in separate PRs after code stops reading them: `Conversation.memory`, unused `AgentConfig` fields, `LEGACY_ONLY_TOOL_NAMES`.
- Backups: nightly `pg_dump` to off-host storage; restore drill documented and run once per quarter.

## 7. Configuration

- One zod schema at boot. Every env var declared, typed, and required unless it has a safe default.
- No secret defaults (`dev-admin-key`, `whsec_dev`, `dev-internal-key`, `temp_test_key_123`). Missing secret → refuse to start.
- `.env.example` generated from the schema (or checked against it in CI).
- One env file per environment. Remove per-package `.env` files.
- `NODE_ENV=production` disables all dev fallbacks and fake routes.

## 8. Observability

- Pino JSON logs, request id per HTTP request and job id per job, redaction of phone, token, OTP, address.
- Metrics: webhook ACK latency, queue depth/lag, turn latency, LLM calls, tool errors, outbox failures, agent escalations.
- `/healthz` (liveness) and `/readyz` (Postgres + Redis + agent reachable).
- Error tracking (Sentry or equivalent) for API and workers, release-tagged.

## 9. Acceptance criteria

- [ ] `back-api` and `back-worker` are separate entrypoints from one image; neither starts the other's responsibilities.
- [ ] No `prisma db push` anywhere; `prisma migrate deploy` runs as a deploy step.
- [ ] Fresh DB migrates to current schema with zero drift (`prisma migrate diff` clean).
- [ ] Webhook ACK p95 < 100ms under a 100-event burst; no media work on the request path.
- [ ] Duplicate webhook event → one message, one turn, one order.
- [ ] 100 messages on one conversation process in order; messages on different conversations run in parallel.
- [ ] A failed WhatsApp send is never stored as delivered; it is retried, then marked failed and surfaced to the merchant.
- [ ] Outbox rows are the only way outbound messages are sent.
- [ ] Boot fails on a missing secret; no insecure default remains in `back/src/config`.
- [ ] `/readyz` returns 503 when Postgres or Redis is down.
- [ ] Graceful shutdown drains in-flight work and exits within 30s.
- [ ] Logs contain no phone numbers, tokens, OTPs, or addresses.
