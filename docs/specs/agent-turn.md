# Spec: one-turn agent

- **Status:** proposed
- **Replaces:** `ecom_agent/graph.py` (11 nodes), `flows.py`, `nodes/flow.py`, `models/domain.py` flow types
- **Related:** `docs/REWORK_PLAN.md` Phase 2, `docs/PROJECT_REPORT.md` Track 1, issues #77 #80 #87 #88 #89

## 1. Problem

A customer message currently walks up to 11 graph nodes and up to 7 LLM calls:

`hydrate → draft_gate → check_llm → query_tool → flow_resolver → extract_tool_args → address extraction → ask_reply | reply → persist`

The model is asked to classify, pick a tool, resolve a flow, extract arguments, extract an address, and phrase a reply. Several steps ask the same question twice. Worst case is 7 calls × 2 providers × 20s timeout, so one turn can run for minutes.

The state is modeled as a list of `Flow` objects with ids and a `FlowState` enum, plus a `flow_resolver` LLM call that decides create/continue/clarify. The product has one active topic and at most one open order draft. The flow list and its resolver are not justified.

## 2. Goal

One deterministic turn function with a hard budget of three LLM calls, one session object, one active draft, and no graph framework in the request path.

## 3. Non-goals

- Rewriting the agent in TypeScript.
- Removing the gRPC boundary (see [tool-contract.md](tool-contract.md)).
- Changing the tool semantics or the order domain.
- Keeping LangGraph for "future branching". If branching is needed later, it can be plain Python.

## 4. Turn contract

```python
# ecom_agent/turn.py
@dataclass(frozen=True)
class TurnInput:
    merchant_id: str
    customer_id: str
    conversation_id: str
    message_id: str
    text: str | None
    media: MediaRef | None
    config: AgentConfig          # is_active, tone, language, escalation_threshold

@dataclass(frozen=True)
class TurnOutput:
    decision: Literal["reply", "escalate", "ignore"]
    text: str | None
    escalate_reason: str | None
    tool_calls: list[ToolCallRecord]   # for observability
    usage: Usage                      # calls, tokens, latency
```

`run_turn(input, deps) -> TurnOutput` is the only entry point used by the gRPC server and by the evals. No other module may call the model.

`deps` carries the backend client, the session store, the model, and a clock, so evals can run the real turn without network.

## 5. Turn sequence

1. **Guard.** If `config.is_active` is false or the customer is blocked, return `ignore`. No LLM call.
2. **Load.** Read the session row and the last 20 messages (already fetched by `back`, passed in or loaded once). No LLM call.
3. **Decide (LLM call 1).** One structured call returns:
   ```json
   {
     "intent": "answer | act | clarify | escalate | smalltalk",
     "tool": "createOrder | null",
     "args": {},
     "reply": "text when intent is answer/smalltalk",
     "reason": "when intent is escalate",
     "language": "derdja | fr | ar"
   }
   ```
   The prompt contains: merchant config, current session summary, last messages, tool catalog (names + args + descriptions), address state, and the explicit rule that missing arguments must stay missing.
4. **Merge (no LLM).** Deterministic code merges `args` into the active draft:
   - new tool + no active draft → start draft
   - same tool → fill only non-null fields
   - different tool while a draft is open → resolve by rule: if the new intent is a question, answer and keep the draft; if it is a cancel, drop the draft; otherwise ask one clarifying question
   - validate with the generated tool schema; reject unknown keys, coerce numbers, normalize phone/wilaya/commune
5. **Act or ask (no LLM).**
   - all required args present → call the tool through gRPC with the idempotency key
   - missing args → build the question from the schema's `ask` templates (deterministic, localized)
   - tool error → classify: retryable (transport) → retry once; business error → explain and keep or drop the draft per rule
6. **Phrase (LLM call 2, only when needed).** If the decision already contains a customer-facing `reply` and no tool ran, skip. If a tool ran and the result needs prose, one call phrases it from the tool result + tone + language. Never re-asks for facts.
7. **Escalate.** If the decision says escalate, or the draft stalls beyond `escalation_threshold` (from config, not a constant), set takeover and return `escalate` with a reason. No extra LLM call.
8. **Save.** Write the session row, append the turn record, emit metrics.

**Budget:** calls 1 and 2 are the normal path. Call 3 is reserved for one bounded recovery (JSON parse failure on call 1, or tool-result phrasing retry). Never more. A hard counter aborts and escalates rather than looping.

## 6. Session model

One row per conversation. Postgres JSONB. The row is the only state.

```json
{
  "version": 1,
  "activeDraft": {
    "tool": "createOrder",
    "args": { "productId": "p_1", "quantity": 1, "wilaya": "16", "commune": "Bab El Oued" },
    "missing": ["street"],
    "attempts": 2,
    "lastError": null,
    "startedAt": "2026-10-31T10:00:00Z"
  },
  "selectedProduct": { "id": "p_1", "name": "...", "price": 4500 },
  "shownProducts": [{ "id": "p_1", "name": "..." }],
  "address": { "wilaya": "16", "commune": "Bab El Oued", "street": null },
  "lastToolResult": { "tool": "createOrder", "ok": true, "orderId": "..." },
  "language": "derdja",
  "updatedAt": "2026-10-31T10:00:05Z"
}
```

Rules:

- `activeDraft` is nullable. At most one.
- Finished drafts are not kept as history. The order itself is the history. If audit is needed, write a `turn_log` row (see §9).
- `version` allows a migration path for stored rows.
- Size cap 64KB; overflow drops `shownProducts` oldest first.
- No messages in the session. Messages live in `Message` and are loaded by `back`.

## 7. Storage changes

| Today | After |
|---|---|
| LangGraph `InMemorySaver` | deleted |
| LangGraph `PostgresStore` schema `agent` | deleted |
| `Conversation.memory` column (unused) | deleted |
| — | `AgentSession` table: `conversationId` unique, `data` JSONB, `version`, timestamps |
| — | `AgentTurn` table (optional, for audit/metrics): conversation, message, decision, calls, tokens, latency, error |

`AgentTurn` is append-only and pruned after 30 days by a worker job. It is the source for the Overview KPIs and for eval replay.

## 8. Tool surface

Cut 11 → 7. Full contract in [tool-contract.md](tool-contract.md).

| Keep | Why |
|---|---|
| `searchProducts` | catalog lookup |
| `getOrderStatus` | status + tracking |
| `quoteOrder` | price + delivery before creating |
| `createOrder` | the main write |
| `confirmOrder` | COD confirmation |
| `cancelOrder` | customer cancel |
| `escalateConversation` | handover |

| Remove | Where it goes |
|---|---|
| `selectProduct` | session field, set by the merge step |
| `getProductDetails` | `searchProducts` returns details for an exact match |
| `suggestProducts` | prompt behavior over `searchProducts`; no Gemini call inside `back` |
| `calculateShipping` | folded into `quoteOrder` |
| `modifyOrder` | only reintroduce with real usage data; until then, cancel + recreate or escalate |

## 9. Observability

Per turn, emit one structured record:

```json
{
  "turnId": "...", "conversationId": "...", "messageId": "...",
  "llmCalls": 2, "inputTokens": 0, "outputTokens": 0,
  "latencyMs": 0, "toolCalls": ["createOrder"], "decision": "reply",
  "escalated": false, "error": null, "sessionBytes": 0
}
```

No message text, phone numbers, or names in logs. Redaction is enforced by the logger, not by call sites.

## 10. Failure behavior

| Failure | Behavior |
|---|---|
| LLM timeout | one retry on the other provider, then escalate with reason `llm_unavailable` |
| Invalid JSON from call 1 | one repair call with the schema; then escalate |
| Tool transport error | one retry with the same idempotency key; then escalate |
| Tool business error | deterministic explanation, keep draft if recoverable |
| Session row corrupt | reset to empty session, log, continue (never crash the worker) |
| Turn exceeds 30s | abort, save what exists, escalate |

## 11. Acceptance criteria

- [ ] `run_turn` is the only model entry point; `graph.py`, `flows.py`, `nodes/flow.py`, `flow_resolver` deleted.
- [ ] No `Flow`, `FlowState`, `flow_id`, `active_flow_id` in the codebase.
- [ ] LLM calls per turn ≤ 3 in code (hard counter) and p100 ≤ 3 in evals.
- [ ] Eval pass rate ≥ baseline on the full suite.
- [ ] p95 latency < 8s on the eval set and in staging.
- [ ] Cost per turn ≤ 50% of baseline.
- [ ] One `AgentSession` row per conversation; no RAM checkpointer; no `Conversation.memory`.
- [ ] Restarting the agent mid-conversation loses nothing: the next turn continues the same draft.
- [ ] `AgentConfig.isActive=false` and `Customer.blocked=true` produce no LLM call and no send.
- [ ] Escalation threshold comes from config, not a constant.
- [ ] Evals and production use the same `run_turn`; no duplicate decision logic.
- [ ] Every turn emits the structured record; logs contain no PII.
- [ ] Shadow run on 200 recorded transcripts: no regression in decision correctness.
