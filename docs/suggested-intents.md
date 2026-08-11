# Suggested Intents — architecture & code walkthrough

> Read this before reviewing the feature. It explains every file touched, the
> data flow, the guarantees, and how to test it.

## What it is

The assistant ships with **13 covered intents** (`PRODUCT_SEARCH`, `PRODUCT_SUGGEST`, `STATUS_CHECK`, …).
Before this feature, anything else fell into `OUT_OF_SCOPE` and was simply
forgotten. **Suggested intents** add a feedback loop:

1. When a customer asks for something the covered intents can't handle, LLM #1
   may propose a **new** intent (`{ suggested: true, name, description }`).
2. The proposal is **persisted** (`SuggestedIntent` table) with a usage count.
3. Future extractions are **seeded** with the most popular proposals so the
   model *reuses* an existing name instead of inventing duplicates.
4. Because the intent is not implemented, the conversation is **escalated to a
   human** and the AI stops (no tools, no reply).

Nothing is ever auto-executed for an unproven intent — the model proposes, the
count proves demand, a human decides whether to promote it later.

## High-level flow

```
customer message
        │
        ▼
LLM #1 ──extract intents──► INTENT_RESPONSE_SCHEMA (anyOf: string | suggested-object)
        │
        ├─ covered intent ─────────────► resolveTool() → execute tool → LLM #2 reply
        │
        └─ suggested intent ──► recordSuggestion() (count +1)
                               │
                               └─► escalateConversation() → human takes over, AI stops
```

## Code map

| File | Role |
| --- | --- |
| `back/src/modules/ai/schemas/intents.schemas.ts` | The source of truth for the intent type system |
| `back/src/modules/ai/schemas/gemini.schemas.ts` | JSON schema sent to Gemini to constrain LLM #1 output |
| `back/src/modules/ai/schemas/ai.schemas.ts` | Zod schemas that *validate* LLM output after the fact |
| `back/src/modules/ai/suggestedIntents.service.ts` | DB read/write for suggestions |
| `back/prisma/schema.prisma` (+ migration `20260808190304_suggested_intent`) | `SuggestedIntent` table |
| `back/src/modules/ai/prompts/promptBuilder.ts` | Builds LLM #1 (intent) and LLM #2 (reply) prompts |
| `back/src/modules/ai/prompts/systemPrompts.ts` | The rules text telling the model how to propose/reuse |
| `back/src/modules/ai/agent.service.ts` | The pipeline that ties it together |

---

## 1. The type system — `intents.schemas.ts`

The key idea: **an intent is no longer just a string.** It's a discriminated
union.

```ts
// intents.schemas.ts:42 — a proposal the LLM makes for an unimplemented intent
export const SuggestedIntentFieldSchema = z.object({
  suggested: z.literal(true),          // literal true — this is the discriminator
  name: z.string().min(1).max(60),     // canonical SHOUTING_SNAKE name
  description: z.string().min(1).max(200),
});

// intents.schemas.ts:50 — intent = covered enum string OR suggested object
export const IntentFieldSchema = z.union([IntentSchema, SuggestedIntentFieldSchema]);
export type IntentField = z.infer<typeof IntentFieldSchema>;
```

Three helpers you will meet everywhere:

- `isSuggestedIntent(intent)` (`:53`) — a type guard: `typeof intent !== 'string' && intent.suggested === true`.
- `intentToString(intent)` (`:59`) — renders a suggestion as `SUGGESTED:<name>` so
  memory rows, logs and message records can never confuse it with a real intent.
- `resolveTool(intent, entities)` (`:97`) — the deterministic intent→tool map.
  For a suggested intent it returns **`null`**: there is no tool yet.

This commit also renamed the escalation tool `createSupportTicket` →
`escalateConversation` and wired `ESCALATION` to it (`INTENT_TOOL_MAP`, `:94`).

## 2. The two schema systems — why both?

Gemini uses its own JSON-Schema-ish `responseSchema` to *shape* what the model
generates (`gemini.schemas.ts`); Zod (`ai.schemas.ts`) *verifies* it afterward.
They mirror each other and must be kept in sync by hand — both are commented
with that reminder.

The Gemini intent field is an `anyOf` (`gemini.schemas.ts:17`):

```ts
intent: {
  anyOf: [
    { type: 'string', enum: [...IntentSchema.options] },          // covered
    { type: 'object', properties: { suggested, name, description }, // proposal
      required: ['suggested', 'name', 'description'] },
  ],
},
```

> **Gotcha found during testing:** Gemini rejects `enum: [true]` on a boolean
> property ("Invalid value … TYPE_STRING, true"). `suggested` is therefore a
> plain `{ type: 'boolean' }`. The Zod layer still enforces literal `true`, so a
> model that omits/falses the flag gets rejected and the message falls back.

`ai.schemas.ts:12` `IntentItemSchema` validates each item, and
`LLMResponseSchema` (`:25`) the whole array (`min 1 / max 4`). Note
`status`/`candidates`/`unresolvedReason` are optional in the Gemini schema and
defaulted in Zod (`default('resolved')`, etc.).

## 3. Persistence — `SuggestedIntent` + `suggestedIntents.service.ts`

`schema.prisma:361`:

```prisma
model SuggestedIntent {
  id          String   @id @default(cuid())
  name        String   @unique          // one row per canonical name
  description String?
  count       Int      @default(1)      // popularity evidence
  createdAt   DateTime @default(now())
  lastSeenAt  DateTime @default(now())
  @@index([count(sort: Desc)])
}
```

The service (`suggestedIntents.service.ts`):

- `recordSuggestion(name, description)` (`:15`) — upsert by `name`; on repeat,
  `count` increments and `lastSeenAt` refreshes. **Guard:** names that are
  already covered enum values are ignored (`COVERED_INTENTS` set) — the table
  can never be polluted with implemented intents.
- `topSuggested(limit)` (`:36`) — top N by `count` descending, again excluding
  covered names. This feeds the prompt seeding.

## 4. The prompts — `promptBuilder.ts` + `systemPrompts.ts`

`buildIntentPrompt` (`promptBuilder.ts:27`) now accepts
`knownSuggestedIntents` (`:24`) and, when present, injects them into LLM #1
(`:36`):

```
Previously suggested intents (reuse these names if they match):
  RETURN_REQUEST (suggested) — Customer wants to return an item
```

`systemPrompts.ts` adds the matching rules:
- **Covered intents** are explicitly "never flag these as suggested".
- **Existing suggestions:** reuse the SAME name — never invent a duplicate.
- **Brand-new proposals** are allowed only if: legit, recurring, automatable,
  not one-off, and not something that "belongs in the e-commerce domain yet can
  never be automated." The name must be a generalized `SHOUTING_SNAKE` (e.g.
  `RETURN_REQUEST`, `PAYMENT_REFUND`), not a phrase tied to one message.

> `buildReplyPrompt` (`promptBuilder.ts:78`) was rewritten in this commit too.
> It was pre-existing dead/broken code (referenced `ctx.tone`/`ctx.intent`/
> `ctx.entities` that no longer exist and used `toolSection` before its
> declaration — a guaranteed runtime crash). It now renders the multi-intent
> view: intent list, conversation act, tool results (ids stripped), memory,
> plus tone/language overrides.

## 5. The pipeline — `agent.service.ts`

Walkthrough of `processMessage`:

1. **Fetch known suggestions** (`:207`) — `topSuggested(10)` → `AgentContext`.
2. **LLM #1** (`:215`) — calls Gemini with `buildIntentPrompt(intentContext)` +
   `INTENT_RESPONSE_SCHEMA`. Output goes through `parseResponse` + Zod.
3. **Sort + save** (`:234`–`:254`) — intents are re-ordered by safety-net
   priority; the primary intent is stored on the message row
   (`intentToString()` so a suggestion reads `SUGGESTED:RETURN_REQUEST`).
4. **Suggested-intent handling** (`:267`–`:293`):
   - collect `sortedIntents.filter(isSuggestedIntent)`,
   - for each unique name → `recordSuggestion(name, description)` (deduped via
     a `Set`),
   - then `executeTool('escalateConversation', {})` → sets
     `takenOverByHuman = true`.
5. **Early return on takeover** (`:343`) — if the conversation is owned by a
   human (suggestion, threshold escalation, or a tool like `escalateConversation`),
   memory is persisted and the AI **stops**: no LLM #2, no reply.
6. **Tool loop** (`:353`) — for covered intents, `resolveTool()` picks the tool;
   `null` results (e.g. suggestions that somehow slipped past) are recorded as
   "no tool needed" for the reply.
7. **LLM #2 reply** (`:446`) — only reached when nobody owns the conversation.

So a suggested intent has two observable effects: the DB `count` bumps, and the
customer gets **transferred to a human** (escalation notification + open human
takeover) rather than a bot reply.

## 6. Safeguards (edge cases)

| Concern | Defense |
| --- | --- |
| Model re-invents the same suggestion | Prompt seeding + reuse rule; `name` unique → `count` increments instead of a new row |
| Table polluted with covered names | `recordSuggestion` + `topSuggested` both filter `COVERED_INTENTS` |
| Model outputs garbage proposal | Zod requires `suggested:true` + name ≤60 + desc ≤200 → parse error → message falls back |
| Bot acts on an unimplemented intent | `resolveTool()` → `null`; the takeover branch stops before tools/reply |
| Duplicate recording in one message | `Set` dedupe in the record loop |
| Free-tier Gemini rate limits | Not app-level: retry on 429 |

## 7. How to test

1. Rebuild: `docker compose up -d --build back` (the container runs the old build otherwise).
2. Inject an out-of-coverage message via the webhook (dev mode skips HMAC):

   ```bash
   curl -s -X POST http://localhost:3000/whatsapp/webhook \
     -H "Content-Type: application/json" \
     -d '{
       "event": "message.received",
       "sessionId": "<a real WhatsAppSession id>",
       "data": { "from": "+213792842752", "body": "salam! wach khedmtkom lazem nzid filat tsawer lel product?", "type": "text", "timestamp": 1754000000 }
     }'
   ```

   (session id + phone must belong to an existing merchant/customer, see the
   `WhatsAppSession`/`Customer` tables.)
3. `docker logs -f ecomassistant-back-1 | grep -i suggested` →
   `recorded suggested intent "<NAME>"`.
4. Check the DB: `SELECT name, description, count FROM "SuggestedIntent" ORDER BY count DESC;`
5. Send the same message again → `count` bumps to 2 (reuse, not duplicate).
6. Send a *different* out-of-coverage message → the model reuses the seeded name
   instead of proposing a new one.

## 8. Where this can grow

- **Promotion workflow:** a dashboard that surfaces high-`count` suggestions and
  lets you promote one into a real covered intent: add the enum value, a
  `resolveTool` entry, and a `ToolHandler` in `tools/registry.ts`. The
  `COVERED_INTENTS` filter then automatically stops recording it.
- **Tighter proposals:** raise the min/max on `name`/`description`, or validate
  `name` against `^[A-Z][A-Z0-9_]+$`.
