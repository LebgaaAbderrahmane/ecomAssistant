# MIME-Type Handling Architecture

**Scope:** Complete analysis of how message MIME types are detected, classified, normalized, persisted, and routed across the EcomAssistant system — from the moment a WhatsApp message arrives at the OpenWA gateway until it reaches the AI (Gemini) model and any downstream processing.

**Author:** architectural analysis (no code changes were made)
**Date:** 2026-08-04

---

## 1. Executive Summary

EcomAssistant is an e-commerce WhatsApp bot. A customer's message enters the system through **OpenWA**, a self-hosted WhatsApp gateway (two engine adapters: Baileys and whatsapp-web.js), which normalizes native WhatsApp message types into an *engine-neutral vocabulary* and attaches a `media` envelope (with `mimetype`, base64 `data`, size, and an "omitted" flag) to media messages. OpenWA delivers these to the **back** Express API over a signed webhook (`message.received`).

The back service then:

1. Verifies the webhook signature.
2. Classifies the message type via its **own** mapping (`mapWaType`) — duplicating OpenWA's normalization.
3. Persists the raw base64 blob to disk (`/app/uploads/media`), derives a file extension from the MIME type (`mimeToExt`), and stores MIME metadata on the `Message` row.
4. For **voice** messages, calls Gemini to transcribe audio; for **images**, calls Gemini to caption + classify. Both are **blocking, synchronous** calls inside the webhook handler.
5. Enqueues the message on a BullMQ queue; a worker runs the two-stage AI agent (intent extraction → tool execution → reply generation).
6. Sends the final reply back through OpenWA.

MIME type information flows through **three independent vocabularies** that must stay in sync by convention only:

| Layer | Vocabulary | Where defined |
|---|---|---|
| WhatsApp engine | native tokens (`chat`, `ptt`, `imageMessage`, …) | Baileys / wwebjs protobufs |
| OpenWA | engine-neutral `MessageType` (`text`, `image`, `video`, `audio`, `voice`, `document`, `sticker`, `location`, `contact`, `revoked`, `unknown`) | `OpenWA/src/engine/interfaces/whatsapp-engine.interface.ts` |
| Back | app-level `contentType` (free string) + `messageType` (`text \| voice \| image`) | `back/src/modules/whatsapp/whatsapp.controller.ts`, Prisma `Message` |

**The currently-blocking defect** (the reported `ReferenceError`) is a single typo in `back/src/modules/ai/clients/gemini.client.ts:34` — the variable is spelled `resolvedMidmeType` but referenced as `resolvedMimeType` on line 41. Because that reference is unconditional, **every** `callLLM` invocation (transcription, captioning, intent extraction, reply generation, product matching) throws, which is why the worker fails on every message.

A full list of additional weaknesses — including a stale `voice`-type mapping that silently prevents voice-note transcription, and a webhook-signature header-name mismatch — is in §10.

---

## 2. System Architecture Context

```
                    ┌────────────────────────────┐
                    │   WhatsApp (customer)      │
                    └─────────────┬──────────────┘
                                  │ WhatsApp Web protocol
                    ┌─────────────▼──────────────┐
                    │  OpenWA gateway            │  (NestJS + BullMQ)
                    │  - Baileys / wwebjs engine │
                    │  - engine adapters         │   engine-neutral IncomingMessage
                    │  - WebhookService          │   media: { mimetype, data, ... }
                    └─────────────┬──────────────┘
                                  │  signed webhook POST
                                  │  X-OpenWA-Signature
                    ┌─────────────▼──────────────┐
                    │  back (Express API)        │
                    │  whatsapp.controller       │──▶ disk: /app/uploads/media
                    │  conversation.service      │──▶ Postgres (Message row)
                    │  transcription/caption     │──▶ Gemini (pre-enrichment)
                    └─────────────┬──────────────┘
                                  │ enqueueMessageJob
                    ┌─────────────▼──────────────┐
                    │  BullMQ "message" queue    │
                    └─────────────┬──────────────┘
                                  │ message.worker
                    ┌─────────────▼──────────────┐
                    │  agent.service (processMessage)
                    │  LLM #1 intent extraction  │
                    │  tools (search/orders/…)   │──▶ Postgres
                    │  LLM #2 reply generation   │──▶ WhatsApp (outbound)
                    └────────────────────────────┘
```

- **Postgres** — Prisma; conversations, messages, customers, products, orders, sessions.
- **Redis** — BullMQ broker + QR cache.
- **`/app/uploads`** — a volume mounted into the `back` container (`docker-compose.yml`), served by Express at `/uploads/…` and also written directly by the controller.

---

## 3. Complete Message Flow (end to end)

### 3.1 Origin — WhatsApp engine adapters (OpenWA)

**Engine interfaces** — `OpenWA/src/engine/interfaces/whatsapp-engine.interface.ts`

- `MessageType` (lines 44–55): `text | image | video | audio | voice | document | sticker | location | contact | revoked | unknown`. This is the *only* type vocabulary downstream consumers should see. `voice` is deliberately distinct from `audio` (a push-to-talk voice note vs. an audio *file*).
- `IncomingMessage.media` (lines 90–98):
  ```ts
  media?: {
    mimetype: string;
    filename?: string;
    data?: string;      // base64; absent when payload was omitted (see `omitted`)
    omitted?: boolean;  // True when media exceeded the inbound size cap and the blob was dropped
    sizeBytes?: number; // Decoded byte size; always set when `omitted` is true
  };
  ```

**Type normalization** — two adapters, one contract:

- `OpenWA/src/engine/adapters/message-mapper.ts` — `mapWwebjsMessageType` (lines 9–35) maps whatsapp-web.js tokens: `chat→text`, `image→image`, `video→video`, `audio→audio`, `ptt→voice`, `document→document`, `sticker→sticker`, `location→location`, `vcard→contact`, `revoked→revoked`, else `unknown`.
- `OpenWA/src/engine/adapters/baileys-message-mapper.ts` — `mapBaileysMessageType(contentType, isPtt)` (lines 8–33) maps protobuf content types: `conversation`/`extendedTextMessage→text`, `imageMessage→image`, `videoMessage→video`, `audioMessage→(isPtt ? voice : audio)`, `documentMessage→document`, `stickerMessage→sticker`, `locationMessage→location`, `contactMessage→contact`, else `unknown`.
- The current deployment uses `ENGINE_TYPE=baileys` (`docker-compose.yml` line 72), so voice notes arrive as neutral `voice`.

**Media extraction & MIME detection** — `OpenWA/src/engine/adapters/baileys.adapter.ts`, `mapMessage` (lines 977–1065):

- Body is `conversation ?? extendedTextMessage?.text ?? image/video/document caption ?? ''` (line 982–988). **The caption becomes `body`; the binary stays in `media`.**
- For media types, `normalizeMessageContent` unwraps `documentWithCaptionMessage`/`viewOnceMessage`/`ephemeralMessage` (line 1018), then reads the inner sub-message (lines 1019–1026):
  ```ts
  const mimetype = subMessage?.mimetype ?? '';             // raw string, NOT stripped
  const filename = normalizedContent.documentMessage?.fileName ?? undefined;
  const declared = coerceDeclaredSize(subMessage?.fileLength);
  ```
  → **The MIME type is taken verbatim from the WhatsApp protobuf `mimetype` field** (e.g. `audio/ogg; codecs=opus`, `image/jpeg`, `video/mp4`). It is *not* sniffed from bytes and not normalized here.

**Inbound media safety caps** — `OpenWA/src/engine/adapters/inbound-media-cap.ts`:

- `inboundMediaMaxBytes()` — default **50 MiB**, overridable via `MEDIA_DOWNLOAD_MAX_BYTES`.
- `coerceDeclaredSize` — normalizes a sender-declared `fileLength` (number / Long / numeric string / absent → 0).
- `capInboundMedia` — final guard. Under cap: `{ mimetype, filename, data: toBase64() }`. Over cap: `{ mimetype, filename, omitted: true, sizeBytes }` — the blob is *never* base64-encoded.
- `inboundMediaConcurrency()` — max 4 concurrent downloads (`INBOUND_MEDIA_CONCURRENCY`).
- Pre-download declared-size gate + mid-download streaming abort (`downloadInboundMediaCapped`, lines 952–975) bound heap usage.
- **Error fallback:** if the download throws, `mapMessage` emits the message **without** a `media` field at all (lines 1058–1063) — downstream never learns media existed.

### 3.2 Delivery — OpenWA WebhookService

`OpenWA/src/modules/session/session.service.ts` — the engine's `onMessage` callback (line 595):

1. Skips status/story broadcasts.
2. Runs the `message:received` hook chain (plugins may mutate/stop).
3. Persists the message to OpenWA's own SQLite (`waMessageId` UNIQUE → dedup oracle).
4. Fire-and-forget `webhookService.dispatch(id, 'message.received', finalMessage)` (line 677) and a WebSocket emit.

`OpenWA/src/modules/webhook/webhook.service.ts` — `dispatch` (line 199):

- Envelope (lines 233–240): `{ event, timestamp, sessionId, idempotencyKey, deliveryId, data }`.
- `data` is the whole `IncomingMessage` — including `type` (neutral) and `media` (`mimetype`, `data`, `omitted`, `sizeBytes`).
- Signs with HMAC-SHA256 using the webhook `secret`; header **`X-OpenWA-Signature`** (`sha256=<hex>`) (lines 279–283, 444–448).
- Delivers via BullMQ queue (or direct fallback) with exponential retry; SSRF-guarded URL.

> ⚠️ Note the signature header is `X-OpenWA-Signature` (see §10.7 for the mismatch in `back`).

### 3.3 Ingress & security — Express

`back/src/app.ts`:

- `express.json()` with a `verify` hook that captures `req.rawBody` (lines 14–18).
- `app.use('/uploads', express.static(path.resolve('/app/uploads')))` (line 33) — the persisted media is served back as static files.
- Global error handler (lines 36–39).

`back/src/routes/index.ts` (line 15) mounts `whatsappRoutes` at `/whatsapp`; `back/src/modules/whatsapp/whatsapp.routes.ts` (line 10) exposes `POST /whatsapp/webhook` **without** authentication (signature is the auth) → `handleWebhook`.

`handleWebhook` — `back/src/modules/whatsapp/whatsapp.controller.ts:72`:

- **Signature verification** (lines 78–83): in non-dev, reads `req.headers["x-hub-signature-256"]` and compares against `verifyHmac(JSON.stringify(req.body), signature)`. (See §10.7 — this does not match what OpenWA sends.)
- `verifyHmac` (lines 56–66): `crypto.timingSafeEqual` on hex digests; returns `false` when no secret is configured.
- Extracts `event`, `sessionId`, `data`; logs `[WhatsApp] Webhook received: event=... sessionId=...` (matches the log line from the incident).
- Routes on `switch (event)`:
  - `message.received` → message pipeline (below).
  - `session.status` → session/QR/notification handling (no MIME involvement).
  - default → `{ status: "ignored" }`.

### 3.4 Message classification (back)

Inside the `message.received` case (`whatsapp.controller.ts:94–239`):

1. `extractPhone(from)` (line 68) strips the `@c.us` / `@g.us` suffix → `phone`.
2. `msgType = mapWaType((data.type as string) || "text")` (line 98).
3. Resolve `WhatsAppSession` by `sessionId`; ignore unknown sessions (lines 106–112).
4. Resolve/create `Conversation` for the merchant+customer; auto-create if the customer exists (lines 114–135).

**`mapWaType`** (lines 41–52) — the back's own type classification:

```ts
const map = {
  text: "text",
  image: "image",
  video: "video",
  audio: "audio",
  ptt: "audio",        // ← stale: OpenWA now emits "voice", not "ptt"
  document: "document",
  sticker: "image",
};
return map[type] || "text";   // unknown/default → "text"
```

> ⚠️ `voice` (OpenWA's neutral token for PTT voice notes, what Baileys actually emits) is **missing**. See §10.2.

5. Media handling (lines 137–166):
   - `media = data.media as { mimetype?, data?, omitted? }` (line 143).
   - Only when `media?.data && media.mimetype && !media.omitted`:
     - `ensureMediaDir()` (line 152) — `fs.mkdirSync("/app/uploads/media")`.
     - `ext = mimeToExt(media.mimetype)` (line 153).
     - `filename = `${conversation.id}-${Date.now()}${ext}`` (line 154).
     - `fs.writeFileSync(fullPath, Buffer.from(media.data, "base64"))` (line 156).
     - Sets `mediaUrl = /uploads/media/<filename>`, `mimeType = media.mimetype` (raw), `filePath = mediaUrl`.
     - Derives `messageType`:
       - `msgType === "audio"` → `messageType = "voice"` (lines 161–162).
       - `msgType === "image"` → `messageType = "image"` (lines 163–165).
   - If media is **absent, omitted, or has no data**: `mediaUrl`/`mimeType`/`filePath` stay `undefined` and `messageType` stays `"text"` — even for a media-typed message.

6. Content fallback (line 169): `content = body || (msgType === "text" ? "" : `[${msgType} message]`)`.

7. Persist via `conversationService.addMessage(...)` (lines 171–179) with:
   `contentType: msgType`, `mediaUrl`, `mimeType`, `rawPayload` (always `undefined`), `messageType`, `filePath`, `createdAt`.

**`mimeToExt`** (lines 24–39) — MIME → file extension:

```ts
const map = {
  "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp",
  "audio/ogg": ".ogg", "audio/mpeg": ".mp3", "audio/mp4": ".m4a",
  "video/mp4": ".mp4", "video/3gpp": ".3gp",
  "application/pdf": ".pdf",
};
return map[base] || ".bin";   // unknown → .bin (observed in production: uploads/media/*.bin)
```
`base` strips parameters (`mime.split(";")[0].trim().toLowerCase()`) — good, but note the *stored* `mimeType` is the raw, parameterized string (see §10.5).

### 3.5 Media persistence

`back/src/modules/whatsapp/conversation.service.ts` — `addMessage` (lines 21–62):

- Creates the `Message` row and updates `Conversation.lastMessageAt` in parallel.
- Defaults: `contentType: "text"`, `messageType: "text"`, `direction`/`sender` derived from `role`.
- Persists `mediaUrl`, `mimeType`, `rawPayload`, `filePath` (null when absent).

Prisma `Message` model (`back/prisma/schema.prisma:195–231`):

```prisma
contentType    String  @default("text")
mediaUrl       String?
mimeType       String?
whatsappMessageId String? @unique   // never populated by the webhook handler
text           String
rawPayload     Json?
filePath       String?
messageType    String  @default("text")
entities       Json?
intent         String?
confidence     Float?
```

### 3.6 Pre-LLM media enrichment (voice & image only)

Both run **synchronously in the webhook request handler** before the message is queued.

**Voice transcription** — `back/src/modules/whatsapp/whatsapp.controller.ts:184–203` → `back/src/modules/ai/media/transcription.service.ts`:

- Reconstructs the filesystem path from the URL: `path.resolve("/app", filePath.slice(1))` (line 185).
- `transcribeAudio(fullPath, mimeType!)` (transcription.service.ts:16):
  ```ts
  const parts: ContentPart[] = [
    { type: "audio", data: buffer, mimeType },        // buffer from fs.readFileSync
    { type: "text",  text: buildTranscriptionPrompt() },
  ];
  await callLLM({ systemPrompt, userMessage: parts, responseMimeType: "text/plain" });
  ```
- On success: updates `Message.content` and `Message.text` to the transcript (lines 188–191).
- On failure: writes the fallback `"[voice message - transcription failed]"` (lines 194–202).

**Image captioning** — `whatsapp.controller.ts:206–232` → `back/src/modules/ai/media/imageCaption.service.ts`:

- `captionImage(fullPath, mimeType!)` (imageCaption.service.ts:62):
  ```ts
  const parts: ContentPart[] = [
    { type: "image", data: buffer, mimeType },
    { type: "text",  text: buildImageCaptionPrompt() },
  ];
  await callLLM({ systemPrompt, userMessage: parts, responseSchema: IMAGE_CAPTION_SCHEMA });
  ```
- The `IMAGE_CAPTION_SCHEMA` (lines 20–37) constrains Gemini output: `{ productName, description, category }` where `category ∈ {PRODUCT_PHOTO, PAYMENT_PROOF, DAMAGE_COMPLAINT, OTHER}`.
- Result persisted: `content`/`text` = `description`, `entities = { imageCategory, productName }` (lines 210–219).
- On failure: fallback `"[image - could not process]"` (lines 223–231).

> ⚠️ **Video, document, sticker-as-unknown, and location messages are never enriched.** Only `audio→voice` and `image` messageTypes trigger Gemini. Videos become `[video message]` text; documents `[document message]` text.

### 3.7 Queue + worker

`back/src/queues/message.queue.ts`:

- BullMQ queue `"message"`, `attempts: 5`, exponential backoff (`delay: 1000`), `removeOnComplete: 1000`, `removeOnFail: 5000`.
- `enqueueMessageJob(messageId)` adds a job.

`back/src/workers/message.worker.ts`:

- Worker with `concurrency: 5`, calls `processMessage(job.data.messageId)`.
- `failed` handler logs `[worker] message <id> failed: <error>` — exactly the log observed in the incident, with the stack tracing to `gemini.client.ts:41`.

### 3.8 Agent processing

`back/src/modules/ai/agent.service.ts` — `processMessage` (line 55):

1. Loads `Message` + `Conversation` + `Customer` (lines 56–66).
2. **Image-category routing** (lines 68–87), only when `message.messageType === "image"`:
   - `PAYMENT_PROOF` / `DAMAGE_COMPLAINT` → `effectiveText = "[Image received: payment proof|damage complaint] <text>"` (escalation signal; the AI replies defensively).
   - `PRODUCT_PHOTO` → prepends `"[Customer sent a photo (product: <name>)] <text>"` so intent extraction is rich.
   - `OTHER` / uncategorized → falls through with `effectiveText = message.text` (the caption).
   - **Note:** this routing reads `messageType` (app-level), `entities.imageCategory` (from captioning). Voice transcripts reach the agent via `message.text`; no special routing.
3. **LLM #1 — multi-intent extraction** (lines 89–112): `callLLM({ systemPrompt: buildIntentPrompt(...), userMessage: effectiveText, responseSchema: INTENT_RESPONSE_SCHEMA })`. Text-only (no ContentParts).
4. **Parsing** — `back/src/modules/ai/parser/response.parser.ts`: `stripFences` → `JSON.parse` → Zod `LLMResponseSchema`; wraps failures in `LLMParseError`.
5. **Intent sorting** (lines 43–53, 115–124): by LLM `order`, tie-broken by hardcoded `INTENT_PRIORITY`.
6. Persists primary intent + entities (lines 127–135).
7. **Tool loop** (lines 152–216): `resolveTool` → entity enrichment (`resolveProductId`) → `executeTool` (registry) → stores product search results into entities + memory.
8. **LLM #2 — reply generation** (lines 231–235): `callLLM({ systemPrompt: buildReplyPrompt(...), userMessage: effectiveText, responseSchema: REPLY_RESPONSE_SCHEMA })`, parsed with `ReplyResponseSchema`.
9. Persists each reply as an `OUT`/`AI`/`assistant` Message row (lines 248–259).
10. **Outbound send** (lines 262–282): finds the session; `openwaService.sendMessagesSequentially` → `sendText` (text-only; **no media is ever sent back**).
11. **Memory update** (lines 284–306): merges intents into `Conversation.memory` JSON.

### 3.9 LLM client layer (the MIME boundary)

`back/src/modules/ai/clients/llm.client.ts`:

```ts
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "audio"; data: Buffer; mimeType: string }
  | { type: "image"; data: Buffer; mimeType: string };

export interface CallLLMParams {
  systemPrompt: string;
  userMessage: string | ContentPart[];
  responseSchema?: object;
  responseMimeType?: string;      // output MIME
}
```

- `ContentPart` is a discriminated union modeling the **input** payloads Gemini can accept. `mimeType` on audio/image parts is the input MIME; `responseMimeType` is the requested *output* MIME.
- `callLLM` is re-exported from `./gemini.client`.

`back/src/modules/ai/clients/gemini.client.ts`:

```ts
function toGeminiContents(userMessage: string | ContentPart[]) {
  if (typeof userMessage === "string") return userMessage;
  return userMessage.map(part => part.type === "text"
    ? { text: part.text }
    : { inlineData: { mimeType: part.mimeType, data: part.data.toString("base64") } });
}
```

- Text parts → `{ text }`; binary parts → Gemini `inlineData { mimeType, data }` (base64). **No whitelist/validation** of `part.mimeType` happens here.
- `callLLM` (lines 31–57) computes the **output** MIME:
  ```ts
  const resolvedMidmeType = responseMimeType ?? (responseSchema ? "application/json" : "text/plain"); // ← TYPO (line 34)
  ...
  responseMimeType: resolvedMimeType,   // ← undefined identifier → ReferenceError (line 41)
  ```
  The typo on line 34 means line 41 references an undefined binding. Since line 41 runs unconditionally, **every `callLLM` throws**, cascading to:
  - `transcription.service.ts:31` and `imageCaption.service.ts:77` (pre-enrichment, inside the webhook handler — caught and replaced with fallback text there),
  - `agent.service.ts:96` and `agent.service.ts:231` (worker — uncaught, so the job fails after 5 retries),
  - `tools/searchHelpers.ts:71` (product matcher).
  This is the root cause of the `[worker] message ... failed: ReferenceError: resolvedMimeType is not defined` log.

- Response handling: `usageMetadata` is logged (`promptTokenCount`, `candidatesTokenCount`, latency); returns `response.text ?? ""`.

### 3.10 Downstream consumers

- **Frontend:** the current `front/src` has **no chat/messaging UI** — media is not rendered anywhere in the dashboard. `mediaUrl`/`mimeType` are effectively stored for future use (or consumed out-of-band). Escalated image messages are only viewable in the WhatsApp app itself.
- **Escalations** (`back/src/modules/escalations/escalations.service.ts`): lists conversations with `escalatedAt != null`; the last message is shown. `Conversation.escalatedAt` is not set anywhere in the flow above (no escalation write in the image route), so image-based escalations rely on the AI reply text only.

---

## 4. MIME-Type Handling Inventory

### 4.1 Normalization pipeline

| Step | Component | Input | Output | Notes |
|---|---|---|---|---|
| Engine token → neutral type | `baileys-message-mapper.ts` / `message-mapper.ts` | `audioMessage`/`ptt`, `imageMessage`, … | `text \| image \| video \| audio \| voice \| document \| sticker \| location \| contact \| revoked \| unknown` | `audioMessage`+`ptt` → `voice`; this is the *only* place MIME-vs-kind is considered (by content type token, not MIME string) |
| Neutral type → app type | `whatsapp.controller.ts` `mapWaType` | `data.type` (neutral) | `text \| image \| video \| audio \| document` (falls back to `text`) | **Missing `voice`** (§10.2); duplicates OpenWA logic |
| Media MIME → extension | `whatsapp.controller.ts` `mimeToExt` | raw `media.mimetype` | `.jpg/.png/.gif/.webp/.ogg/.mp3/.m4a/.mp4/.3gp/.pdf/.bin` | Parameter-stripped for the *filename* only |
| Media MIME → persisted | `conversation.service.ts` | raw `media.mimetype` | stored as `Message.mimeType` | **Parameters retained** (§10.5) |
| Media MIME → Gemini input | `gemini.client.ts` `toGeminiContents` | `ContentPart.mimeType` | `inlineData.mimeType` | Passed verbatim; no whitelist |
| Output MIME resolution | `gemini.client.ts` `callLLM` | `responseMimeType` / `responseSchema` | `application/json` or `text/plain` | Currently broken by typo |
| Caption category | `imageCaption.service.ts` + `agent.service.ts` | image category | `PRODUCT_PHOTO / PAYMENT_PROOF / DAMAGE_COMPLAINT / OTHER` | Second-order classification derived from the *image*, not the MIME |

### 4.2 File type routing matrix (as implemented today)

| OpenWA `data.type` | `mapWaType` | `messageType` | Enriched? | Agent sees |
|---|---|---|---|---|
| `text` | `text` | `text` | — | body |
| `image` | `image` | `image` | ✅ caption + category | `[Customer sent a photo...]` or `[Image received...]` + description |
| `audio` | `audio` | `voice` | ✅ transcription | transcript |
| `voice` (PTT) | **`text`** | **`text`** | ❌ (silently skipped) | `""` (empty) — **bug** |
| `video` | `video` | `text` | ❌ | `[video message]` |
| `document` | `document` | `text` | ❌ | `[document message]` |
| `sticker` | `image` | `image` | ✅ caption | description of the sticker |
| `location` | `text` (default) | `text` | ❌ | `[location message]` |
| `contact` | `text` (default) | `text` | ❌ | `[contact message]` |
| `revoked` | `text` (default) | `text` | ❌ | `""` |
| `unknown` | `text` (default) | `text` | ❌ | `[unknown message]` |

### 4.3 MIME types referenced across the codebase

| MIME | Purpose | Where |
|---|---|---|
| `image/jpeg`, `image/png`, `image/gif`, `image/webp` | extension map | `mimeToExt` |
| `audio/ogg`, `audio/mpeg`, `audio/mp4` | extension map | `mimeToExt` |
| `video/mp4`, `video/3gpp` | extension map (unused downstream) | `mimeToExt` |
| `application/pdf` | extension map (unused downstream) | `mimeToExt` |
| `application/json` | output MIME when `responseSchema` set | `gemini.client.ts` |
| `text/plain` | default output MIME | `gemini.client.ts` |
| `image/png` | QR code / status posts | `OpenWA status.service.ts`, `whatsapp.controller.ts` QR strip |
| `application/octet-stream` | outbound fallback when base64 without mimetype | `OpenWA message.service.ts:656` |

---

## 5. Sequence Diagrams

### 5.1 Inbound media message (e.g. an image or voice note)

```
Customer           OpenWA                    back: /whatsapp/webhook      conversation/DB         Gemini
   │                   │                            │                         │                    │
   │  image / ptt msg  │                            │                         │                    │
   │──────────────────▶│  baileys adapter           │                         │                    │
   │                   │  mapMessage():                            ───────────┐                    │
   │                   │   type = neutral (image/voice)            │            │                    │
   │                   │   media.mimetype = protobuf field          │           │                    │
   │                   │   download → base64 / cap / omitted         ──────────┤                    │
   │                   │ session.service.onMessage()                            │                    │
   │                   │  persist (dedup by waMessageId)                        │                    │
   │                   │  webhookService.dispatch("message.received")           │                    │
   │                   │───────────────────────────────────────────────────────▶│                    │
   │                   │  X-OpenWA-Signature (HMAC-SHA256)                      │                    │
   │                   │                                                        │ handleWebhook      │
   │                   │                                            verify sig  │                    │
   │                   │                                            mapWaType    │                    │
   │                   │                                            mimeToExt    │                    │
   │                   │                                            write file to /app/uploads/media│
   │                   │                                            addMessage(contentType,mimeType,│
   │                   │                                              messageType,filePath)        │
   │                   │                                            ──────────────▶ (Message row)  │
   │                   │                                            if voice:                     │
   │                   │                                              transcribeAudio(mime)────────▶│
   │                   │                                            if image:                      │
   │                   │                                              captionImage(mime)──────────▶│
   │                   │                                            update Message (content/entities)
   │                   │                                            enqueueMessageJob(id)          │
   │                   │◀──────────────────────────── {status:"received"}                          │
   │                   │                                            │                              │
   │                   │                      BullMQ "message" queue │                              │
   │                   │                          worker → processMessage(id)                       │
   │                   │                             LLM#1 intent (text only)──────────────────────▶│
   │                   │                             tools (DB)                                     │
   │                   │                             LLM#2 reply───────────────────────────────────▶│
   │                   │                             persist OUT messages; sendText back            │
   │                   │◀────────────────────────────────────────── send-text ──────────────────────│
```

### 5.2 Where MIME is used vs. ignored (decision map)

```
IncomingMessage.media.mimetype
 ├─ mimeToExt() ──────────────► filename extension (persistence)
 ├─ Message.mimeType ─────────► stored, never read again in the pipeline
 ├─ ContentPart.mimeType ─────► Gemini inlineData.mimeType (input)
 │
 ├─ messageType = "voice" (from type=="audio") ──► transcription
 ├─ messageType = "image" (from type=="image") ──► caption + category routing
 └─ anything else ────────────► placeholder text, no MIME-driven processing
```

---

## 6. Component Responsibility Reference

### OpenWA (`OpenWA/src`)

| File | Responsibility (MIME-relevant) |
|---|---|
| `engine/interfaces/whatsapp-engine.interface.ts` | Defines neutral `MessageType`, `IncomingMessage.media` envelope, `MediaInput` (outbound). The anti-corruption contract. |
| `engine/adapters/message-mapper.ts` | wwebjs token → neutral type; base IncomingMessage builder. |
| `engine/adapters/baileys-message-mapper.ts` | Baileys protobuf content type → neutral type (incl. `ptt → voice`). |
| `engine/adapters/baileys.adapter.ts` | Media extraction: reads protobuf `mimetype`, filename, declared size; capped streaming download; `capInboundMedia`. |
| `engine/adapters/inbound-media-cap.ts` | Size caps + coercion + omitted-envelope marker. |
| `engine/adapters/whatsapp-web-js.adapter.ts` | Same contract for the wwebjs engine (`downloadMedia()` + cap). |
| `modules/session/session.service.ts` | `onMessage` → hook chain → dedup persist → webhook dispatch. |
| `modules/webhook/webhook.service.ts` | Payload envelope, filters, HMAC signing, queued/direct delivery + retries. |
| `modules/message/message.service.ts` | Outbound sends; `mimetype` required with base64; default `application/octet-stream`. |
| `modules/message/message-type-backfill.service.ts` | Startup migration of legacy wwebjs type tokens in its own DB. |
| `modules/status/status.service.ts` | Hardcodes `image/jpeg` / `video/mp4` for status posts. |

### Back (`back/src`)

| File | Responsibility |
|---|---|
| `app.ts` | JSON body + `rawBody` capture; `/uploads` static serving; error handler. |
| `routes/index.ts`, `modules/whatsapp/whatsapp.routes.ts` | Route mounting; `POST /whatsapp/webhook` (unauthenticated). |
| `modules/whatsapp/whatsapp.controller.ts` | Webhook entry: signature, `mapWaType`, `mimeToExt`, disk write, persistence, voice/image enrichment, enqueue. |
| `modules/whatsapp/conversation.service.ts` | `addMessage`: persists MIME metadata + defaults; conversation queries. |
| `modules/whatsapp/whatsapp.service.ts` | `openwaService` HTTP client (send text/media/typing; session/webhook management). |
| `queues/message.queue.ts` | BullMQ queue config (5 attempts). |
| `workers/message.worker.ts` | Consumes queue → `processMessage`. |
| `modules/ai/agent.service.ts` | Two-pass agent: intent extraction, image-category routing, tool loop, reply generation, send, memory. |
| `modules/ai/clients/llm.client.ts` | `ContentPart` union + `CallLLMParams`; the LLM-client abstraction. |
| `modules/ai/clients/gemini.client.ts` | Gemini adapter: `ContentPart → inlineData`, output-MIME resolution. **Contains the active bug.** |
| `modules/ai/media/transcription.service.ts` | Audio → text via Gemini (`responseMimeType: text/plain`). |
| `modules/ai/media/imageCaption.service.ts` | Image → `{productName, description, category}` via Gemini + Zod. |
| `modules/ai/parser/response.parser.ts` | `stripFences` + JSON.parse + Zod for agent responses. |
| `modules/ai/schemas/gemini.schemas.ts` | JSON-schema-style response schema for Gemini (shapes generation). |
| `modules/ai/schemas/ai.schemas.ts` | Zod schemas (verifies generation). |
| `modules/ai/prompts/promptBuilder.ts`, `systemPrompts.ts` | System prompts. |
| `modules/ai/tools/registry.ts`, `searchHelpers.ts` | Tool registry; product matching (also calls `callLLM`). |
| `prisma/schema.prisma` | `Message` model fields for MIME/media metadata. |

---

## 7. Design Patterns & Abstractions

1. **Adapter / Anti-Corruption Layer (OpenWA).** Each WhatsApp engine is wrapped by an adapter that maps library-specific tokens/protos to the neutral `MessageType` + `IncomingMessage` shape, so downstream never sees engine dialects. *Strength:* clean seam; *weakness:* the back API then duplicates the mapping instead of consuming the same vocabulary.
2. **Strategy / Factory.** `EngineFactory` selects the engine by `ENGINE_TYPE`. `MessageType` is the strategy interface.
3. **Queued job / Command.** Webhook → `enqueueMessageJob` → BullMQ → worker → `processMessage`. Decouples HTTP latency from AI latency; gives retries + concurrency.
4. **Pipeline (two-pass LLM).** LLM #1 (intent) → deterministic tools → LLM #2 (reply). Media enrichment (transcription/caption) is a *third*, pre-queue stage.
5. **Schema-shaping vs. schema-verification.** Gemini `responseSchema` (JSON-schema-ish, `gemini.schemas.ts`) constrains generation; Zod (`ai.schemas.ts`) validates afterward. Commented explicitly as two different jobs.
6. **Discriminated union (ContentPart).** `{type:'text'|'audio'|'image', ...}` as the input payload abstraction. Cleanly extensible (e.g. `video`) but currently only text+audio+image.
7. **Contract-by-convention (no shared package).** Back and OpenWA live in separate packages with no shared type/schema. `mapWaType` and `mimeToExt` are hand-maintained mirrors of OpenWA's behavior — the source of drift (§10.2).

---

## 8. Weaknesses, Inconsistencies & Duplicated Logic

### 8.1 Critical (active)

1. **`ReferenceError: resolvedMimeType is not defined` — `gemini.client.ts:34/41`.**
   `resolvedMidmeType` (typo) is computed but `resolvedMimeType` (correct spelling) is referenced. Every `callLLM` throws. This breaks the whole AI pipeline. One-character fix on line 34.

2. **`mapWaType` lacks `voice` → voice notes never transcribed.** OpenWA emits neutral `voice` for PTT voice notes (Baileys `audioMessage` + `ptt`). `mapWaType` only handles legacy `ptt`. So `data.type === "voice"` falls to the `"text"` default: no `messageType = "voice"`, no `transcribeAudio`, and the agent receives an **empty string** (PTT has no `body`). Evidence: `uploads/media/*.ogg` files exist, so voice notes do arrive — but the pipeline treats them as empty text. The `ptt: "audio"` entry is stale.

3. **Webhook signature header mismatch (production outage risk).** OpenWA signs with `X-OpenWA-Signature` (`webhook.service.ts:282`, format `sha256=…`). `back` verifies `x-hub-signature-256` (`whatsapp.controller.ts:79`) and `verifyHmac` returns `false` when no secret is set (`line 57`). In production (`isDev === false`) every webhook would be rejected 401 — **unless** the verification branch is effectively bypassed. This is likely why signatures are effectively a non-guard today; the two sides must agree on one header + one serialization.

### 8.2 High

4. **Duplicated, drifting MIME knowledge.** `mapWaType` + `mimeToExt` in the back re-implement OpenWA's normalization with their own literal maps. Any change on one side (like `ptt → voice`) silently breaks the other. No shared package, no test cross-checks.

5. **Raw `mimeType` retained with parameters.** `mimeToExt` strips `;codecs=…`, but `Message.mimeType` and the Gemini `inlineData.mimeType` receive the raw string (e.g. `audio/ogg; codecs=opus`). Gemini's documented input MIME types are plain (`audio/ogg`); parameterized strings may be rejected or treated as unknown. Should normalize once at the boundary.

6. **URL→path reconstruction hack.** `path.resolve("/app", filePath.slice(1))` (`whatsapp.controller.ts:185, 207`) treats the stored `mediaUrl` as a path by stripping the leading `/`. `MEDIA_DIR` is hardcoded to `/app/uploads/media` (line 16), so **local (non-Docker) development cannot write media** (no `/app` on a dev machine). Couples the webhook handler to the container mount layout.

7. **Video, document, location, contact, revoked messages are MIME-dead ends.** No `ContentPart` type for video, no routing for documents. A customer sending a `.mp4` or `.pdf` gets a `[video message]`/`[document message]` placeholder and the agent must guess. Sticker→image works but is incidental.

8. **`omitted`/over-cap media silently degrades.** When `media.omitted === true` (or `data` missing), the branch at `whatsapp.controller.ts:151` is skipped entirely: `messageType` stays `text`, `mimeType`/`mediaUrl`/`filePath` are null, and the message is persisted with `content = "[<type> message]"`. The `omitted`/`sizeBytes` envelope is discarded — no signal to the agent or an operator that media existed but was dropped.

### 8.3 Medium

9. **Synchronous blocking work in the webhook handler.** `fs.writeFileSync`, `transcribeAudio` (network + LLM), `captionImage` (network + LLM) all run inside the request handler. A slow Gemini call stalls the webhook response and the event loop (Redis/DB latency for all other requests). The queue exists precisely for async work but the expensive media enrichment happens *before* enqueueing.

10. **`rawPayload` declared but never populated** (`whatsapp.controller.ts:139`), yet passed to `addMessage` — always `undefined`/null. Dead field.

11. **`whatsappMessageId` never stored**, so back has no idempotency key for webhook redeliveries. OpenWA retries could create duplicate `Message` rows (and duplicate agent runs/replies), especially since `addMessage` is called before the queue.

12. **No mime whitelist / size / count policy in `back`.** Any `mimetype` with base64 data is accepted and written to disk (as `.bin` for unknown); the only cap lives in OpenWA. No cleanup of orphaned files (`uploads/media` accumulates — e.g. the `.bin` files are permanent).

13. **Empty outputs not guarded.** `transcribeAudio` returns `transcript.trim()` with no non-empty check; `callLLM` returns `response.text ?? ""`. A blocked/empty Gemini response produces an empty or garbage message that is still enqueued and replied to.

14. **`captionImage` parses with raw `JSON.parse(raw)`** (`imageCaption.service.ts:83`), whereas the agent path uses `stripFences`. Gemini wrapping the JSON in ``` fences would throw here; the fallback `"[image - could not process]"` would mask it.

15. **Double prompt injection.** `captionImage`/`transcribeAudio` pass the *same* prompt as both `systemPrompt` and a text `ContentPart` — redundant tokens and possible conflicting instructions.

16. **Overlapping type taxonomies on `Message`.** `contentType` (free string, OpenWA-ish: `image/video/document/audio/…`) coexists with `messageType` (`text|voice|image`, app-level) and `text` (the actual content). `filePath` stores a *URL*, not a path. Naming is inconsistent (`mimeType` vs OpenWA's `mimetype`, `mediaUrl` vs `filePath`).

17. **Escalation UX gap.** `PAYMENT_PROOF`/`DAMAGE_COMPLAINT` images are framed as escalations in text, but nothing sets `Conversation.escalatedAt`, and the frontend has no media renderer — the human operator can only see the image in the WhatsApp app.

18. **`verifyHmac` re-serializes `req.body` with `JSON.stringify`** rather than using the captured `req.rawBody` (available in `app.ts`). Serialization round-trip can reorder keys / escape differences → signature mismatches even if the header name were fixed.

19. **Fragile placeholder/content contract.** `content = body || (msgType === "text" ? "" : "[...message]")` produces an empty string for text messages with empty bodies and for `revoked`/`voice` (empty body) — the empty string then flows into the agent as the user message.

20. **Hardcoded model/prompt details.** `MODEL_NAME` default `gemini-3.5-flash`, `temperature: 0.4` (gemini.client.ts:9,43) — fine, but MIME-relevant defaults (`text/plain` output) are implicit and duplicated in `transcription.service.ts:34` and `gemini.client.ts:34`.

### 8.4 Low

21. Fallback strings are English while the WhatsApp copy is French (`whatsapp.controller.ts` vs `sendOrderNotification`) — cosmetic inconsistency.
22. `mimeToExt` maps `video/3gpp`/`application/pdf` that no downstream code path ever consumes — dead mappings, but they document intent.
23. `message.queue` `removeOnComplete: 1000` / `removeOnFail: 5000` keeps no long-term audit of failures; failures are only visible in logs.

---

## 9. Recommended Improvements (for planning; not implemented)

1. **Fix the typo** `resolvedMidmeType → resolvedMimeType` (`gemini.client.ts:34`) — unblocks the entire pipeline.
2. **Reconcile the type vocabularies.** Add `voice: "audio"` (or `voice: "voice"`) to `mapWaType` and introduce a **shared type/MIME module** (e.g. a `shared/` package referenced by both back and OpenWA) so neutral types + MIME→extension mappings can't drift. At minimum, add cross-repo tests asserting `mapWaType` covers every `MessageType` enum value.
3. **Fix the signature contract.** Align on one header (`X-OpenWA-Signature`) and sign the exact payload bytes (`req.rawBody`) on both sides; fail-closed in production only after alignment.
4. **Normalize MIME once at the boundary** (strip `;` parameters, lowercase) before persisting and before sending to Gemini; keep a separate `filename`/extension field instead of overloading `filePath`/`mediaUrl`.
5. **Move media enrichment into the worker** (a `media.process` job before the agent job) so webhook latency and event-loop blocking are removed; make enrichment idempotent with `whatsappMessageId`.
6. **Add a `video` ContentPart + routing**, or explicitly reject/skip unsupported MIME families with a user-facing message instead of the current placeholder text.
7. **Surface `omitted`/`sizeBytes`** in the stored message (entities or dedicated fields) and generate a helpful AI response (e.g. "please resend a smaller file").
8. **Whitelist supported input MIMEs** and validate before disk write + before Gemini; enforce size/time budgets in `back`, not just OpenWA.
9. **Use `req.rawBody` for HMAC**; store `whatsappMessageId` for idempotency/dedup on redelivery.
10. **Clean up the taxonomies**: drop `rawPayload` if unused, rename `filePath→mediaLocalPath`, document `contentType` vs `messageType`, or collapse them.

---

## 10. Appendix

### 10.1 Environment & config touchpoints

- `back/src/config/index.ts` — `openwaUrl`, `openwaApiKey`, `openwaWebhookSecret`, `internalUrl`, `appUrl`, `isDev`.
- `back/src/modules/whatsapp/whatsapp.controller.ts` — `MEDIA_DIR = /app/uploads/media` (hardcoded).
- `OpenWA` — `MEDIA_DOWNLOAD_MAX_BYTES` (default 50 MiB), `INBOUND_MEDIA_CONCURRENCY` (default 4), `ENGINE_TYPE`, `SSRF_ALLOWED_HOSTS`, `QUEUE_ENABLED`.
- `docker-compose.yml` — `./uploads:/app/uploads` volume; `back` and `openwa` service wiring.

### 10.2 Key file references

| Concern | Location |
|---|---|
| Neutral `MessageType` + `media` envelope | `OpenWA/src/engine/interfaces/whatsapp-engine.interface.ts:44,57,90` |
| `ptt → voice` mapping | `OpenWA/src/engine/adapters/message-mapper.ts:19`, `baileys-message-mapper.ts:18` |
| MIME read from protobuf | `OpenWA/src/engine/adapters/baileys.adapter.ts:1025` |
| Media size caps | `OpenWA/src/engine/adapters/inbound-media-cap.ts` |
| Webhook dispatch | `OpenWA/src/modules/session/session.service.ts:677` |
| HMAC signing header | `OpenWA/src/modules/webhook/webhook.service.ts:282,444` |
| Back webhook entry + maps | `back/src/modules/whatsapp/whatsapp.controller.ts:41,24,72` |
| Media persist | `back/src/modules/whatsapp/conversation.service.ts:21` |
| Voice/image enrichment | `back/src/modules/whatsapp/whatsapp.controller.ts:184,206` |
| `ContentPart` union | `back/src/modules/ai/clients/llm.client.ts:1` |
| `resolvedMimeType` bug | `back/src/modules/ai/clients/gemini.client.ts:34,41` |
| Agent two-pass | `back/src/modules/ai/agent.service.ts:55,96,231` |
| `Message` model | `back/prisma/schema.prisma:195` |

---

*End of document. No source files were modified.*
