# EcomAssistant

AI-powered WhatsApp agent for Algerian e-commerce merchants. Automates COD order confirmation, follow-ups, product Q&A, and delivery integration — in Derdja, French, and Arabic.

---

## Architecture

```
ecomAssistant/
├── back/              # Express + TypeScript API
│   ├── src/           # App setup, routes, config
│   ├── prisma/        # Database schema & migrations
│   └── Dockerfile
├── front/             # React + Vite + TailwindCSS
│   ├── src/           # Components, pages, hooks
│   └── Dockerfile
├── shared/            # @ecomassistant/shared
│   └── src/
│       ├── types/     # Domain types (shared between front & back)
│       ├── schemas/   # Zod validation schemas
│       └── utils/     # Helpers (wilaya names, price formatting, etc.)
├── docker-compose.yml # Full stack: postgres + redis + back + front
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── .env.example
```

All three packages live in a single pnpm monorepo. The `shared` package is consumed by both `back` and `front` as a workspace dependency.

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

All four containers (postgres, redis, back, front) run in Docker. Source code is mounted as a volume, so hot reload still works.

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
│   └── routes/
│       └── index.ts      # API route definitions
├── prisma/
│   └── schema.prisma     # Full database schema (9 models)
├── Dockerfile
├── tsconfig.json
└── package.json

front/
├── src/
│   ├── main.tsx          # React entry point
│   ├── App.tsx           # Root component (placeholder)
│   ├── index.css         # Tailwind imports
│   └── vite-env.d.ts     # Vite type declarations
├── index.html
├── vite.config.ts        # Dev server config, API proxy
├── tailwind.config.js
├── postcss.config.js
├── Dockerfile
├── tsconfig.json
└── package.json

shared/
└── src/
    ├── index.ts          # Barrel export
    ├── types/
    │   └── index.ts      # Merchant, Order, Conversation, Product, etc.
    ├── schemas/
    │   └── index.ts      # Zod schemas (signup, login, agent config, etc.)
    └── utils/
        └── index.ts      # getWilayaName, formatPrice, maskPhone
```

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

Additional variables (WhatsApp, Shopify, LLM, etc.) are listed in `.env.example` — configure them as you integrate each service.

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
