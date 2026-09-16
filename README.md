# EcomAssistant

AI-powered WhatsApp agent for Algerian e-commerce merchants. Automates COD order confirmation, follow-ups, product Q&A, and delivery integration — in Derdja, French, and Arabic.

---

## Architecture

Multi-container architecture orchestrated via Docker Compose. The WhatsApp
channel is owned by OpenWA, the AI reasoning lives in a separate Python
agent (LangGraph + LLM providers), and the TypeScript backend handles
product sync, business logic, and message routing. The backend and agent
communicate over an **internal gRPC boundary** authenticated with a shared
`INTERNAL_API_KEY`.

```
┌──────────────────────────┐         ┌──────────────────────────┐
│                          │ gRPC    │                          │
│   back (TypeScript)      │◄───────►│  ecom_agent (Python)     │
│   Express + Prisma       │ :50052  │  LangGraph + LLM clients │
│                          │         │                          │
│   ToolService :50051     │         │  AgentService :50052     │
└────────────┬─────────────┘         └──────────────────────────┘
             │                                      │
             │                                      │
    ┌────────▼────────┐                   ┌─────────▼─────────┐
    │    postgres     │                   │  groq / gemini    │
    │    redis        │                   │  LangSmith        │
    └─────────────────┘                   └───────────────────┘
             │
    ┌────────▼────────┐
    │   openwa        │   WhatsApp WebSocket (whatsapp-web.js)
    └─────────────────┘
             │
       WhatsApp Cloud
```

### Services

| Service | Language | Host port(s) | Compose DNS | Role |
|---|---|---|---|---|
| `back` | TypeScript (Express) | 3000, 5555 | `back` | API + message router + ToolService gRPC server |
| `front` | React + Vite | 5173 | — | Merchant dashboard |
| `ecom_agent` | Python (LangGraph) | — | `agent` | AI conversation agent + AgentService gRPC server |
| `postgres` | PostgreSQL 16 | — | `postgres` | Primary data store |
| `redis` | Redis 7 | — | `redis` | Session + message queue |
| `openwa` | Node.js | 3000 (REST + WS) | `openwa` | WhatsApp bridge (whatsapp-web.js) |

**Ports note**: the gRPC ports (back `:50051`, agent `:50052`) are **internal only** — never
published to the host. Only the back HTTP and front dashboard ports are reachable
from outside Docker.

### Ownership

| Service | Domain | Notes |
|---|---|---|
| `back` | TypeScript backend | Products, orders, conversations, ToolService |
| `front` | React frontend | Merchant dashboard, auth UI |
| `ecom_agent` | AI / Python backend | LangGraph agent, LLM integration, ToolService client |
| `postgres` | Platform / infra | Database, seeded on first run |
| `redis` | Platform / infra | Session cache, message queue |
| `openwa` | Platform / infra | WhatsApp WebSocket, message relay |

### Message flow

```
WhatsApp → openwa REST webhook
         → back (message router, MESSAGE_HANDLER=grpc)
         → AgentService.ProcessMessage → ecom_agent (LangGraph)
           → ToolService.ExecuteTool → back (DB read/write)
           ← AgentService.ProcessMessage response (DECISION_REPLY)
         → back sends reply via openwa
```

### gRPC boundary

Both services read the same proto definitions from `contracts/proto/`. Full
protocol reference: [docs/grpc-contract.md](docs/grpc-contract.md).

| Service | Auth | Notes |
|---|---|---|
| `AgentService.Health` | **none** (intentional) | Container healthcheck probe |
| `AgentService.ProcessMessage` | `INTERNAL_API_KEY` | Main entry point for inbound messages |
| `ToolService.Health` | `INTERNAL_API_KEY` | Back health via HTTP `/health` (not gRPC) |
| `ToolService.ExecuteTool` | `INTERNAL_API_KEY` | All 11 tools with structured outcomes |

### Local start

#### Full stack (Docker)

```bash
cp .env.example .env   # set INTERNAL_API_KEY + LLM keys (GROQ_API_KEY / GOOGLE_API_KEY)
docker compose up -d
# back:   http://localhost:3000
# front:  http://localhost:5173
```

#### Dev mode (services in Docker, app local)

```bash
docker compose up -d postgres redis openwa
pnpm dev
# back:   http://localhost:3000
# front:  http://localhost:5173
```

#### E2E gRPC matrix

```bash
docker compose exec back ./node_modules/.bin/tsx scripts/grpc-check.ts
```

Exercises every RPC: AgentService.Health/ProcessMessage round trip,
all 11 tools (success + NOT_FOUND), auth rejection (missing/wrong key),
and human-takeover read/write gating. Outputs PASS/FAIL per check
and finishes with `ALL CHANNELS OK`.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | >= 20 | [nodejs.org](https://nodejs.org) |
| pnpm | >= 9 | `npm install -g pnpm` |
| Docker | latest | [docker.com](https://docker.com) |
| Docker Compose | v2+ | Included with Docker Desktop |

---

## Quick start

### 1. Setup

```bash
# Clone the repo
git clone <repo-url> && cd ecomAssistant

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env
```

### 2. Start services (database + cache)

```bash
docker compose up -d postgres redis
```

### 3. Push database schema

```bash
pnpm --filter back db:push
```

### 4. Run the application

```bash
pnpm dev
```

The API is now at **http://localhost:3000** and the dashboard at **http://localhost:5173**.

---

## Running modes

### Mode A: Services in Docker, app locally (recommended for daily dev)

```bash
docker compose up -d postgres redis   # DB + cache only
pnpm dev                               # App with hot reload
```

### Mode B: Everything in Docker

```bash
docker compose up -d   # Full stack in containers
```

All six services (postgres, redis, back, front, agent, openwa) run in Docker.
Source code is mounted as a volume, so hot reload still works.

### Mode C: Individual packages

```bash
pnpm --filter back dev     # API only
pnpm --filter front dev    # Dashboard only
pnpm --filter shared build # Build shared types (usually not needed — consumed directly)
```

---

## Useful commands

```bash
# ─── Development ──────────────────────────────────────

pnpm dev              # Run all packages with hot reload
pnpm build            # Compile everything
pnpm lint             # Lint all packages

# ─── Database ─────────────────────────────────────────

pnpm --filter back db:push       # Sync Prisma schema → DB (safe for dev)
pnpm --filter back db:migrate    # Create a new migration
pnpm --filter back db:generate   # Regenerate Prisma client

# ─── Package management ────────────────────────────────

pnpm --filter back add <pkg>     # Add dependency to back
pnpm --filter front add <pkg>    # Add dependency to front
pnpm --filter shared add <pkg>   # Add dependency to shared

# ─── Docker ────────────────────────────────────────────

docker compose ps                             # Check container status
docker compose logs -f back                   # Tail API logs
docker compose logs -f front                  # Tail frontend logs
docker compose down                           # Stop all containers
docker compose down -v                        # Stop + delete DB volume (loses data)
```

---

## Project structure (detail)

```
back/
├── src/
│   ├── index.ts          # Server entry point
│   ├── app.ts            # Express app setup (middleware, routes)
│   ├── config/
│   │   └── index.ts      # Env-based config loader
│   ├── grpc/             # gRPC boundary (agent client, tool server, proxy)
│   ├── modules/ai/       # Intent parsing, tool registry, agent bridge
│   ├── modules/whatsapp/ # OpenWA webhook, reply delivery
│   └── routes/           # API route definitions
├── prisma/
│   └── schema.prisma     # Full database schema
├── scripts/
│   └── grpc-check.ts     # E2E gRPC matrix (see Architecture)
├── Dockerfile
├── tsconfig.json
└── package.json

front/
├── src/
│   ├── main.tsx          # React entry point
│   ├── App.tsx           # Root component (placeholder)
│   ├── index.css         # Tailwind imports
│   └── vite-env.d.ts     # Vite type declarations
├── Dockerfile
└── package.json

ecom_agent/
├── ecom_agent/           # Python package (agent loop, tools, LLM clients)
├── healthcheck.py        # gRPC AgentService.Health probe (container healthcheck)
├── Dockerfile
└── pyproject.toml

contracts/
├── proto/
│   ├── agent/v1/agent.proto    # AgentService (Health, ProcessMessage)
│   └── tools/v1/tool.proto     # ToolService (Health, ExecuteTool)
└── src/generated/              # Generated tool schemas (tools.json)

OpenWA/                  # WhatsApp bridge (whatsapp-web.js) container
shared/
└── src/
    ├── types/           # Domain types (shared between front & back)
    ├── schemas/         # Zod validation schemas
    └── utils/           # Helpers (wilaya names, price formatting, etc.)
```

The TS packages (back, front, shared) live in a single pnpm monorepo; `shared`
is consumed as a workspace dependency. `contracts/` holds the single source of
truth for the gRPC boundary (protos + generated tool schemas), consumed by both
`back` and `ecom_agent`.

---

## Database models

The Prisma schema defines 9 models matching the PRD domain:

| Model | Purpose |
|-------|---------|
| `Merchant` | Account (email, password hash) |
| `StoreConnection` | Shopify/WooCommerce link (OAuth tokens, sync status) |
| `AgentConfig` | Per-merchant agent settings (language, tone, follow-ups) |
| `Product` | Synced catalog items with variants |
| `Order` | Customer orders with COD details, status, tracking |
| `Conversation` | WhatsApp conversation tied to an order |
| `Message` | Individual messages within a conversation |
| `WilayaDeliveryCost` | Delivery pricing per wilaya per merchant |

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_USER` | Yes | `ecom` | PostgreSQL user |
| `POSTGRES_PASSWORD` | Yes | `ecom_dev_password` | PostgreSQL password |
| `POSTGRES_DB` | Yes | `ecomassistant` | PostgreSQL database name |
| `DATABASE_URL` | Yes | — | Full Postgres connection string |
| `REDIS_URL` | Yes | `redis://redis:6379` | Redis connection string |
| `API_PORT` | No | `3000` | API server port |
| `NODE_ENV` | No | `development` | Environment |
| `JWT_SECRET` | Yes | — | Secret key for auth tokens |
| `INTERNAL_API_KEY` | Yes | — | Shared secret for gRPC (back ↔ agent) |
| `MESSAGE_HANDLER` | No | `grpc` | `grpc` routes messages to the Python agent; `legacy` keeps the old TS pipeline |
| `LOG_LEVEL` | No | `info` | pino log verbosity (binary/observability) |

Since the TypeScript/agent split, gRPC, WhatsApp, and LLM variables (e.g.
`AGENT_GRPC_ADDR`, `TOOLS_GRPC_ADDR`, `BACK_TOOLS_GRPC_ADDR`, `OPENWA_*`,
`GROQ_API_KEY`, `GOOGLE_API_KEY`, `LLM_PROVIDER`, `GROQ_MODEL`, `GEMINI_MODEL`,
`CHARGILY_*`) are managed in `.env.example` — copy it to `.env` and configure
as you integrate each service.

---

## Team workflow

### Branch strategy

- `dev` — default branch, all work merges here
- Feature branches: `feat/<name>` (e.g. `feat/shopify-oauth`)
- Bug fixes: `fix/<name>`
- After merging to `dev`, test before promoting to `main` (when ready for release)

### First-time setup for each team member

```bash
git clone <repo-url>
pnpm install
cp .env.example .env
docker compose up -d postgres redis
pnpm --filter back db:push
pnpm dev
```

### Adding a new shared type

Edit `shared/src/types/index.ts`, import from `@ecomassistant/shared` in back or front. No build step needed — the workspace reference resolves directly to source.

---

## Troubleshooting

**`ERR_MODULE_NOT_FOUND dotenv`**: `pnpm --filter back add dotenv`

**`DATABASE_URL not found`**: Ensure `back/.env` exists with `DATABASE_URL=postgresql://ecom:ecom_dev_password@localhost:5432/ecomassistant`

**Docker permission denied**: Add your user to the docker group: `sudo usermod -aG docker $USER` then log out and back in.

**Port already in use**: `lsof -ti :3000 | xargs kill` or restart your machine to free ports.

**Prisma schema changes not reflected**: Run `pnpm --filter back db:push` to sync without creating a migration file, or `pnpm --filter back db:migrate` to create one.
