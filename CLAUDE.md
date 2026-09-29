# ecomAssistant

AI WhatsApp agent for Algerian e-commerce merchants (COD order confirmation,
follow-ups, product Q&A, delivery integration). Derdja / French / Arabic.

## Architecture

Multi-container app, orchestrated with Docker Compose:

```
openwa (WhatsApp bridge) → back (TS/Express, router) → agent (Python/LangGraph)
                                    │                          │
                              postgres / redis          groq / gemini LLMs
```

- `back` and `agent` talk over an **internal gRPC boundary** (never exposed to
  host). `back` runs `ToolService` (:50051), `agent` runs `AgentService`
  (:50052). Both read the same `.proto` files from `contracts/proto/`.
- Full protocol reference: `docs/grpc-contract.md`.
- Phase history / rollback strategy: `docs/architecture-roadmap.md`.

## Docs

Read these before big changes:

- `docs/architecture-essentials.md` — short onboarding: services, message flow, rules.
- `docs/architecture.md` — full reference of how the system works today.
- `docs/roadmap.md` — feature checklist only (done and next). No bug fixes there.
- `docs/PROJECT_REPORT.md` — audit of problems, risks and fixes. No features there.
- `docs/grpc-contract.md` — the back-to-agent gRPC rules.

Keep them true. When you change routes, models, tools, queues, env variables or
the gRPC contract, update `docs/architecture.md` in the same change. When a
feature ships, tick it in `docs/roadmap.md`. Do not copy the same content into
two files; link to the other file instead.

## Repo layout

| Path | Language | Role |
|---|---|---|
| `ecom_agent/` | Python | LangGraph agent, LLM clients, AgentService gRPC server — **primary work area** |
| `back/` | TypeScript | Express API, Prisma, message router, ToolService gRPC server |
| `front/` | TypeScript | React/Vite merchant dashboard |
| `contracts/` | proto + TS | Source of truth for the gRPC boundary |
| `OpenWA/` | TypeScript | Vendored WhatsApp bridge (runs the Baileys engine here), separate NestJS app |
| `shared/` | TypeScript | Types/schemas shared by `back`/`front` |
| `landing/` | TypeScript | Next.js marketing site, own `AGENTS.md` |

`back`, `front`, `shared`, `contracts` are a pnpm workspace (`pnpm-workspace.yaml`).
`OpenWA` and `landing` are standalone apps, not part of the workspace.

## `ecom_agent/` internals (agent work happens here)

- `graph.py` — LangGraph graph definition (`app`).
- `nodes/` — graph nodes: `check`, `query`, `draft`, `calling`, `memory`, `reply`, `flow`.
  Node logic only; prompts and helpers live in the modules below.
- `routing.py` — every conditional edge (router) between nodes.
- `prompts/` — every LLM prompt and fixed customer text, one file per node,
  plus `common.py` (JSON schema hint, fallback texts). Change prompt wording here only.
- `flows.py` — helpers over conversation memory: active flow and draft,
  selected product, address prerequisites, shipping sync.
- `text/` — `patterns.py` (regexes), `messages.py` (message text helpers),
  `json_parse.py` (pull a JSON object out of LLM output).
- `llm/client.py` — provider-failover LLM client. Priority from `LLM_PROVIDER`
  env (comma-separated, default `groq,gemini`).
- `llm/structured.py` — `call_json` (JSON answer with one retry), `llm_phrase`.
- `tools/` — tool registry, gRPC client to `back`'s ToolService (`tools/grpc.py`),
  and `schema.py` (read, check and cast tool arguments from the args schema).
- `models/` — pydantic models for state, conversation, domain data.
- `grpc_gen/` — **generated** gRPC stubs, committed to the repo. Regenerate
  with `ecom_agent/scripts/gen_stubs.sh` after changing a `.proto` file, then
  commit the `.proto` and the regenerated output together.
- `server.py` — AgentService gRPC server (Health, ProcessMessage). Auth is a
  shared-secret `Authorization: Bearer <INTERNAL_API_KEY>` header, checked
  manually per RPC (see `_authorized` in `server.py`).
- `db.py` — direct `psycopg` read against the shared Postgres (`Message`
  table only). Not an ORM; raw SQL by design.

## Local dev

Two `.env` files exist and are **not interchangeable**:

- root `.env` (from `.env.example`) — used by `docker compose` via `env_file:`
  for every service.
- `ecom_agent/.env` — used by `ecom_agent/config.py` (`load_dotenv`) when the
  agent runs **outside Docker** (e.g. `python -m server` directly on the
  laptop). Docker Compose does not read this file; the agent container gets
  its env from the root `.env` + compose overrides only.

Running the agent locally (not in Docker) needs its own `ecom_agent/.env`
with at minimum `DATABASE_URL`, `INTERNAL_API_KEY`, and whichever of
`GROQ_API_KEY` / `GOOGLE_API_KEY` matches `LLM_PROVIDER`. Compose network
hostnames (`postgres`, `redis`, `back`) don't resolve outside Docker — use
`127.0.0.1` with the published ports instead. Only Postgres (5432) and Redis
(6379) are published.

**A bare agent cannot use tools.** The gRPC ports 50051 (`back` ToolService)
and 50052 (`agent`) are internal to the Compose network and are not published.
So a bare agent cannot call `back:50051`, every tool call fails, and `back`
(in Docker) cannot reach `agent:50052` on the laptop either. Bare mode is only
good for graph and prompt work that does not need a tool. Never publish those
two ports on a server.

Default flow for testing the real message loop: change the agent, then rebuild
only the agent image (it has no bind mount):

```bash
docker compose up -d --build agent
docker compose logs -f agent
```

Bare mode, for prompt and graph work only:

```bash
docker compose up -d postgres redis back
cd ecom_agent
uv venv --python 3.12 && source .venv/bin/activate   # match Dockerfile's 3.12 pin
uv pip install -r requirements.txt
python -m server
```

Full stack in Docker: `docker compose up -d`.

## Git workflow

- `dev` is the default branch — all work merges here.
- Branch naming: `feat/<name>`, `fix/<name>`.
- Nested/stacked feature branches are common in this repo's history (e.g.
  `feat/separate-agent-grpc-*` branches off `feat/separate-agent-grpc`) — check
  what a branch actually forked from before assuming it's off `dev`.
- Merges to `dev` go through PRs (see recent history — squash/merge commits).
- `dev` is promoted to `main` only when a release is ready.

### Git safety rules

- Never commit, push, merge, tag, or create, rename or delete a branch unless
  the user asks for it in that moment. An earlier "yes" does not count later.
- Never run a dangerous git command without asking first and getting a clear
  yes. This includes: `push --force`, `reset --hard`, `clean -f`,
  `checkout .` / `restore .` (throws away changes), `branch -D`, `rebase`,
  `commit --amend`, `filter-branch`, `stash drop` / `stash clear`, and
  `--no-verify`.
- Stage only the files the user names. Do not use `git add -A` or `git add .`.
- Never rewrite history, and never touch a shared branch (`dev`, `main`).
- Reading is always fine: `status`, `diff`, `log`, `show`, `branch`.
- If unsure whether a git command is safe, ask before running it.

## Conventions observed in this codebase

- Python: type hints on function signatures, module-level `logging.getLogger`,
  short docstrings only when they explain a non-obvious *why* (see
  `server.py::_last_reply`) — not what the code does.
- Comments: only when the code cannot say it. One short line. No banner or
  separator blocks (`# =====`).
- Prompts go in `ecom_agent/prompts/`, never inline in a node.
- No test suite and no lint config currently exist under `ecom_agent/`. Don't
  assume `pytest`/`ruff` conventions are already set — ask before introducing
  a new one.
- Env vars are documented in `.env.example` with inline comments explaining
  which service consumes them — keep that pattern when adding new ones.
