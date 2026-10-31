# Rework plan

- **Status:** proposed
- **Baseline:** `dev` at `4dc14be` (2026-10-24)
- **Scope:** agent, backend runtime, contracts, repository, dashboard UI
- **Not in scope:** rewriting the product, new channels beyond WhatsApp, changing the domain (COD, wilaya, commune)

This plan answers one question: where is the system more complicated than the problem it solves, and how do we remove that complexity without losing what already works?

The detailed designs are in [specs/](specs/). Decisions are recorded in [adr/](adr/). Existing bugs and security findings stay in [PROJECT_REPORT.md](PROJECT_REPORT.md) and GitHub Issues; this plan does not repeat them.

## 1. Verdict

The product is not overcomplicated. Four parts of the implementation are:

1. **Agent orchestration.** 11 graph nodes, up to 7 LLM calls per turn, multi-flow state, and a `flow_resolver` LLM step for a workflow that has one open draft at most.
2. **Conversation state.** The same state is stored three times (LangGraph RAM checkpointer, LangGraph Postgres store, unused `Conversation.memory` column), and modeled as a list of `Flow` objects with ids and states.
3. **Tool contract.** 11 tools, three hand-maintained copies of tool metadata, JSON-inside-gRPC payloads, and no Python parity check against the generated catalog.
4. **Repository and runtime.** A vendored 42k-LOC WhatsApp bridge, a near-dead `shared/` package, a second React app with a different React major, two package managers, one process that is API + 3 workers + gRPC server, and no CI.

That is not one hard algorithm. It is many moving parts with weak operational glue. The fix is subtraction plus a small amount of new glue (CI, migrations, outbox, per-conversation ordering), not a rewrite.

## 2. What we keep

These are load-bearing and correct. Do not remove them during the rework.

- `back` owns business logic and tools; the agent only decides. The agent never receives or invents merchant/customer ids.
- Tenant scoping in every query.
- Turn guard: one turn per conversation, saved result per message, idempotency key on `createOrder`.
- Agent notes persisted in Postgres.
- The eval suite (`ecom_agent/evals/`). It is the safety net for every agent change.
- httpOnly cookies, CSRF double-submit, refresh-token revocation.
- The gRPC boundary itself. The payloads are the problem, not the transport.
- Honest docs. `PROJECT_REPORT.md` is unusually good; keep that habit.

## 3. Target shape

```
Customer <-> WhatsApp adapter (OpenWA pinned image now, Cloud API later)
                    |
              back-api (Express + gRPC ToolService)
                    |            \
                 Postgres        Redis
                    |              |
                    |        back-worker (message, media, outbox, follow-up)
                    |
                 agent (Python, one turn module)
                    |
                  LLM (max 3 calls per turn)
```

Rules:

- One active draft, one session row per conversation.
- Max 3 LLM calls per turn, hard cap, measured in evals.
- One generated tool catalog. Python reads it; it does not hand-copy it.
- Typed internal contract; no JSON strings inside gRPC messages.
- API and workers are separate processes from the same image.
- Per-conversation ordering in `back`, not only in the agent.
- Outbound sends go through an outbox with states and retries.
- Media is processed asynchronously after a fast webhook ACK.
- One env schema, one package manager, one CI pipeline, one migration path.
- OpenWA is an external pinned image or a fork, not vendored source.

## 4. Phases

Time estimates assume 1–2 senior developers familiar with the code. Solo doubles them. Phases 1 and 4 can run in parallel with different people.

### Phase 0 — Baseline and decisions (2–3 days)

Work:

- Freeze feature work on `dev` except P0 fixes.
- Record ADRs: keep Python, one turn module, one session, one tool catalog, keep gRPC but type it, externalize OpenWA, frontend stack.
- Capture baseline metrics on the current commit (see §5).
- Choose three tasks to measure end-to-end: find a failed order and take over; resolve an escalation; ship a confirmed order.
- Publish the issue map (this plan + specs) and label the backlog.

Exit:

- Baseline numbers written into this file.
- Every ADR merged.
- No open question blocks Phase 1.

### Phase 1 — Security, CI, operability (1 week)

Work:

- Close every P0 in `PROJECT_REPORT.md` (issues #37–#42 and related).
- CI on every PR: install, typecheck, lint, unit tests, agent pytest + ruff, Prisma validate, build `back` and `front`, build Docker images.
- Branch protection on `dev`: required checks, no direct pushes, linear history optional.
- `prisma migrate deploy` in production. Remove `db push` from the runtime image. Baseline the existing schema as migration zero.
- Multi-stage images, non-root user, no `tsx watch`, no Vite dev server in production.
- `compose.prod.yml`: internal network only, no published Postgres/Redis/OpenWA, healthchecks, resource limits.
- Env validation at boot (zod). No secret defaults. Fail closed.
- Structured logging with redaction and request ids.
- Delete tracked junk, scrub the customer photo, prune merged branches.

Exit:

- Fresh clone + one command deploys a working stack.
- No critical or high security finding open.
- CI is required and green on `dev`.
- Migrations run from zero on an empty database and on a copy of current data.

Spec: [specs/security-release.md](specs/security-release.md).

### Phase 2 — Agent simplification (3–4 weeks)

Work:

- Replace the graph with one turn module: load context → one structured decision call → deterministic merge/validate → act or ask → one phrase call → save.
- Hard cap of 3 LLM calls. Failover only on transport/5xx/429, never on validation errors.
- Delete `flows.py`, `nodes/flow.py`, `flow_resolver`, `Flow`, `FlowState`, `flow_id`, `active_flow_id`, multi-flow routing.
- One session object, one JSONB row per conversation. Delete the RAM checkpointer and the unused `Conversation.memory` column.
- Generate Python tool schemas from `contracts/src/generated/tools.json`. Cut tools 11 → 7.
- Remove the `suggestProducts` LLM call from `back`; suggestion is a prompt concern, not a backend tool.
- Pass `AgentConfig` (active, tone, language, escalation threshold) into the turn. Enforce `isActive` and `Customer.blocked` before the agent is called.
- gRPC deadlines, graceful shutdown, readiness that checks Postgres and model config.

Exit:

- Eval pass rate equal or better than baseline.
- p95 turn latency < 8s; LLM calls per turn ≤ 3 (p100).
- Cost per turn down ≥ 50%.
- Memory flat over 10k synthetic turns.
- No `Flow` type or `flow_resolver` left in the tree.

Spec: [specs/agent-turn.md](specs/agent-turn.md), [specs/tool-contract.md](specs/tool-contract.md).

### Phase 3 — Backend runtime (2–3 weeks)

Work:

- Split `back-api` (HTTP + gRPC ToolService) and `back-worker` (message, media, outbox, follow-up). Same image, different entrypoint.
- Per-conversation serialization in the message queue.
- Outbox for outbound WhatsApp messages: `QUEUED`, `SENDING`, `SENT`, `FAILED`, attempts, provider message id, last error.
- Fast webhook ACK: persist raw event, enqueue, process media in a worker. Remove synchronous transcription/captioning from the request path.
- Remove dead routes, dead models, dead columns, `LEGACY_ONLY_TOOL_NAMES`, and unused config fields.
- Make `shared/` the real typed contract or delete it. Pick one.
- Externalize `OpenWA` (pinned image or fork).
- Add the KPI endpoint the Overview needs. Implement follow-ups or remove the settings that promise them.
- Implement ship-on-confirm or remove the promise.

Exit:

- No lost or reordered messages under a 100-message burst on one conversation.
- Duplicate webhook delivery creates one message and one order.
- Queue lag p95 < 1s at 10 msg/s.
- No media work on the webhook request path.
- `git ls-files | grep OpenWA` returns nothing.

Spec: [specs/backend-runtime.md](specs/backend-runtime.md).

### Phase 4 — UI foundation (2 weeks)

Work:

- Design tokens (color, type, space, radius, elevation, motion) as CSS variables + Tailwind theme.
- Type scale with a 12px floor. Fix contrast failures at the token level.
- ~30 primitives on Radix behavior with custom styling.
- New shell: 240px rail, 56px command bar, content max 1440px.
- TanStack Query + one typed API client + shared resource hooks. Remove per-page fetch/loading/cursor code.
- React Hook Form + zod for all forms.
- Error boundary, suspense, skeletons, lazy routes.
- i18n/RTL foundation: `dir` switching, logical properties, `Intl` formatters.
- `/design` route (or Storybook) showing every primitive and state.

Exit:

- Shell + auth + Orders run behind a flag on the new foundation.
- Zero axe critical/serious violations on the shell.
- Every color pair used for text passes WCAG AA.
- No page re-declares a resource type or hand-rolls a fetch.

Spec: [specs/ui-foundation.md](specs/ui-foundation.md).

### Phase 5 — UI screens (4–5 weeks)

Order of delivery:

1. Overview: real KPIs, needs-attention queue, agent pulse.
2. Orders: ledger table, saved views, detail drawer, bulk bar.
3. Inbox: conversation list, thread, takeover/handback, send, order context.
4. Escalations: resolve inside the dashboard.
5. Catalog.
6. Customers.
7. Settings: routed sections, one save bar per section.
8. Onboarding.
9. Billing: implement or remove.
10. Auth: forgot/reset password.

Exit:

- A merchant can run a COD order end-to-end without leaving the dashboard.
- Every screen has loading, empty, error, and permission states.
- Mobile: card layouts, 44px targets, no horizontal scroll on tables.
- Arabic renders RTL with no clipped or mirrored-wrong controls.

Spec: [specs/ui-screens.md](specs/ui-screens.md).

### Phase 6 — Product gaps (parallel, 4–6 weeks)

- Conversation inbox and takeover (the biggest product gap; blocks Phase 5.3).
- Follow-up scheduler.
- Real KPIs and funnel.
- Billing, or remove the page and the plan card.
- Arabic RTL as a shipped language, not a menu item.
- Landing pricing and claims aligned with the product.

### Phase 7 — QA and launch (1–2 weeks)

- Playwright e2e for six flows: login, connect WhatsApp, confirm order, take over, ship, resolve escalation.
- axe checks in CI.
- Visual regression on the design route and key screens.
- Load test: webhook burst, agent turn concurrency, queue drain.
- Backup/restore and incident runbooks.
- Rollback plan per phase.

## 5. Baseline metrics

Capture before Phase 2 and after every phase. Store results in `docs/metrics/` (one file per run, committed).

| Metric | How | Target |
|---|---|---|
| Eval pass rate | `ecom_agent/evals` full suite | ≥ baseline |
| LLM calls per turn | instrument the turn module | ≤ 3, p100 |
| Tokens per turn | provider usage | −40% |
| Turn latency p50/p95 | gRPC server metric | p95 < 8s |
| Cost per 1k turns | provider billing | −50% |
| Duplicate orders | eval + prod counter | 0 |
| Lost messages | queue + outbox counters | 0 |
| Webhook ACK p95 | Express middleware timing | < 100ms |
| Queue lag p95 | BullMQ metrics | < 1s |
| Front bundle (gzip) | `vite build` report | < 250KB initial |
| Lighthouse perf/a11y | mobile, dashboard | ≥ 90 / 100 |
| axe violations | CI | 0 critical/serious |

## 6. Sequencing rules

- Security and CI before any UI deploy. A beautiful dashboard on an insecure backend is worse than the current one.
- One risky change at a time. Do not rewrite transport while simplifying the agent.
- Every new screen ships behind a flag until it reaches parity.
- Delete code in the same PR that replaces it. No "keep it for later".
- Evals gate every agent PR. No eval, no merge.
- If a phase slips, cut scope from Phase 5 screens, not from Phase 1 or 2.

## 7. What we will not do

- Big-bang rewrite of backend and frontend together.
- Reskin the current pages with new colors and call it a rework.
- Rewrite the agent in TypeScript during this program.
- Add Framer Motion for fades.
- Keep fake KPIs or an empty Billing page.
- Build an inbox without takeover/handback and order context.
- Keep `AgentConfig` fields nothing reads.
- Keep vendored OpenWA source in the app repo.
- Add a second state store "for performance".

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Agent simplification regresses conversations | Lost orders | Eval gate, shadow-run old vs new on recorded transcripts, flag per merchant |
| UI rework stalls at 60% | Two half-designed apps | Foundation first, page-by-page flag, no new features in old UI |
| Security fixes break dev workflow | Team bypasses checks | `compose.dev.yml` keeps convenience, prod compose is strict |
| Migration from `db push` loses data | Outage | Baseline migration + dry run on a prod copy + backup/restore drill |
| Solo maintainer bandwidth | Program stalls | Phase 1 and 2 are the minimum viable rework; UI can pause after foundation |

## 9. Issue map

Program epic: [#121](https://github.com/LebgaaAbderrahmane/ecomAssistant/issues/121).

| Phase | Issues |
|---|---|
| 1 — security, CI, operability | #106 migrations, #107 images, #108 observability; existing #37–#50 |
| 2 — agent, contracts | #99 session, #100 tools, #101 config; existing #77 #80 #86 #89 #98 |
| 3 — backend runtime | #102 split, #103 ordering, #104 outbox, #105 inbound, #109 OpenWA, #110 hygiene |
| 4 — UI foundation | #111 |
| 5 — UI screens | #112 Overview, #113 Inbox, #114 Orders, #115 Escalations, #116 Settings, #117 a11y, #118 i18n/RTL, #119 Billing, #120 Onboarding |

## 10. Definition of done

The rework is done when:

- One turn is one module, at most three LLM calls, one session row, one draft.
- Seven tools, one generated catalog, typed payloads, parity test in CI.
- API and workers scale independently; messages are ordered per conversation; sends are never marked delivered unless delivered.
- `dev` deploys from a fresh machine with migrations, no published datastores, no secret defaults.
- The dashboard has an inbox, real KPIs, an order detail view, routed settings, and passes WCAG AA.
- Arabic is a real language with RTL layout.
- CI is required and covers backend, agent, contracts, frontend, and images.
