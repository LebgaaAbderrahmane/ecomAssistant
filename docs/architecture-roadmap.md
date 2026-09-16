# Delivery roadmap & dependency ordering

Ordering of the phases that shipped the gRPC agent split (TypeScript backend +
Python agent) with a tool-boundary owned by the backend. Each task "proves a
stable layer" before the next builds on it — some predecessor only needs to run
once, not be perfect forever.

## Dependency graph

```
T1 (docker) ──┐
T2 (proto) ───┼── T3 (TS grpc) ── T4 (py server) ── T5 (prove)   [Phase II  gRPC]
              └──────────────┴─────────────────────┴────────┐
T6 (relay) ── T7 (reply.service) ── T8 (e2e)  ◀──────────────┘   [Phase III wapp]
T9 (pure tools) ── T10 (ExecuteTool) ── T11/12/13 (per-domain) ── T14 (agent drives tools)   [Phase IV tools]
T15 (remove legacy) ── T16 (harden)                                                          [Phase V  cleanup]
```

- `T1` (docker) and `T2` (proto) are **independent**; both feed `T3`/`T4`.
- `T3` (TS gRPC server) proves the *transport* on one side, `T4` (Python
  server) on the other; `T5` proves the pair end-to-end (grpc-check matrix).
- `T6`/`T7` re-point the inbound/outbound WhatsApp path at the agent and prove a
  real conversation (`T8`).
- `T9`→`T14` harden the *tool surface*: pure/context-free tools before the
  server exposes them, then per-domain round trips, then the agent drives them.
- `T15` removes the legacy TS agent and worker; `T16` hardened the boundary.

Phases are strictly ordered because each proves a stable layer before the next
adds load on top of it:

> infra → transport → lifecycle → tools → cleanup

## Ordering invariants

| Constraint | Reason |
|---|---|
| `T9` before `T10` | The gRPC server may only ever expose **context-free** tools. Exposing stateful/legacy tools first would leak transport concerns into the agent contract (enforced today by `LEGACY_ONLY_TOOL_NAMES` + a parity test). |
| `T15` after `T14` | Legacy stays as the rollback path until the agent demonstrably owns the **full loop** (inbound → tools → reply). Only then is the old pipeline deleted. |

## Rollback

### Code-level (the real mechanism)

`T15` deleted the previous rollback **switch**: the `MESSAGE_HANDLER=grpc|legacy`
env toggle is gone from the codebase (commit `cf535fe`, "gRPC-only message
worker"), so a misbehaving agent can no longer be bypassed at runtime. The
effective rollback strategy is therefore **phase-commit revert**:

| If this phase misbehaves | Revert |
|---|---|
| Phase II transport (agent not answering / healthcheck failing) | `git revert` of the `T3`/`T5` commits; back continues serving without the agent |
| Phase III reply path (replies wrong target / dropped) | Revert `T6`/`T7` (message routing) — inbound still persists, delivery switches back |
| Phase IV tools (a tool corrupts orders/catalog) | Revert the offending domain commit (`T11/12/13`); the tool is additive so earlier domains keep running |
| Phase V cleanup (a regression from removed legacy) | Revert `T15`; the legacy pipeline is restored together with its switch |

Reversing a phase is *cheap* because each task was committed separately and the
boundary is a stable contract (`contracts/proto/`) rather than shared code.

### Operational

- **Containers**: all images pinned to explicit tags; a faulty deploy is rolled
  back by re-creating from a known-good image (`docker compose up -d` against a
  previously vetted image), not by code changes.
- **Healthchecks**: `ecom_agent` is gated on `AgentService.Health`
  (`healthcheck.py`); `back` on HTTP `/health`. A container that fails its probe
  self-restarts instead of half-serving.
- **Secrets**: the shared `INTERNAL_API_KEY` is the one cross-cutting secret; a
  suspected leak is rolled over by rotating it in `.env` and recreating `back`
  and `ecom_agent` (no data migration involved).
- **Data**: order/product changes from tools are rows in Postgres; a bad tool
  run is corrected at the row level (idempotent re-runs are covered by the
  `grpc-check` matrix) rather than by restoring snapshots.