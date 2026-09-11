# @ecomassistant/contracts

Single source of truth for the inter-service contracts between the TypeScript
backend (`back`) and the Python agent (`ecom_agent`).

## What lives here

- `proto/` — the `.proto` definitions, organized by service:
  - `agent/v1/agent.proto` — `ecomassistant.agent.v1.AgentService` (served by the
    Python agent, called by the backend).
  - `tools/v1/tool.proto` — `ecomassistant.tools.v1.ToolService` (served by the
    backend, called by the Python agent).
- `src/` — TypeScript facts shared by both sides without codegen: tool catalog
  (`TOOL_NAMES`, `ToolName`, `ToolOutcome`, `TOOL_DESCRIPTIONS/ToolDescriptor`).
- `package.json` — see [Versioning](#versioning).

## Ownership

The contract is owned **jointly**: every change must be usable by the service
on the other side.

- Changing `proto/` requires regenerating the Python stubs and updating the
  TypeScript runtime loader consumers (see Regeneration).
- Changing `TOOL_NAMES`/`TOOL_DESCRIPTIONS` requires updating the backend
  registry (enforced by `back/src/modules/ai/__tests__/contract.test.ts`).
- A contract change that is not yet accepted by the other side must not be
  used; land both sides' changes in the same change set.

## Versioning

Version lives in `package.json` (`version`). The package is private/workspace
only; there is no registry release.

- **Minor/patch bumps** — additive changes: a new message field (never removing
  or renumbering), a new tool in the catalog. No coordinates change.
- **Major bump** — breaking changes: renumbering/removing fields, changing a
  service/method signature, removing or renaming a tool. Both sides must land
  the same version.
- Regenerated artifacts carry no separate version; they are always in lockstep
  with the `.proto` committed in the same commit.

Pro tip: because proto3 encodes missing/zero fields indistinguishably, prefer
`` optional `` fields for new additions so you never break old readers.

## Regeneration

Rule — **regenerate on any schema change; commit the generated files.**

Only the Python side generates code (the TS side loads `.proto` at runtime; see
`docs/grpc-ts-loading.md`). Python stubs are produced by:

```bash
ecom_agent/scripts/gen_stubs.sh
```

Preconditions: `grpcio-tools` and `grpcio` installed (they are in
`ecom_agent/requirements.txt` — install with `pip install -r requirements.txt`
inside `ecom_agent/`, or run the script in a container with the pinned
versions).

Output: `ecom_agent/grpc_gen/` — committed. After any `.proto` change:

1. edit `proto/...`
2. run `gen_stubs.sh`
3. commit `.proto` **and** `grpc_gen/` together, bumping `version` per the
   rules above.

## Drift protection

`back/src/modules/ai/__tests__/contract.test.ts` asserts that every tool
registered in the backend (`toolRegistry`) is declared by `TOOL_NAMES`, and
that `TOOL_DESCRIPTIONS` cover `TOOL_NAMES` exactly. Run it with
`npm test` (from `back/`) or `pnpm --filter @ecomassistant/back test`.