# Spec: security and release gate

- **Status:** proposed
- **Related:** `docs/REWORK_PLAN.md` Phase 1, `docs/PROJECT_REPORT.md`, issues #37–#42, #49, #50
- **Rule:** no public deployment, no UI launch, and no new merchant onboarding until every P0 here is closed.

## 1. Why this comes first

Current `dev` is not safe to expose:

- Unauthenticated fake-order and fake-message routes.
- Webhook HMAC skipped in dev, wrong header, hashed re-serialized body.
- OpenWA published with a public dev admin key.
- Postgres, Redis, and Prisma Studio published on all interfaces; Redis has no password.
- Hardcoded encryption key protecting delivery credentials.
- Delivery webhooks unauthenticated; three providers return `true` from signature checks.
- Public `/uploads` containing a real customer photo in git history.
- Delivery order updates by `id` only (IDOR).
- No helmet, wildcard CORS, no timeouts.
- PII and secrets in logs.

A beautiful dashboard on this backend is worse than the current one, because it invites real merchants to put real customer data into it.

## 2. P0 closure list

Each item is tracked by an existing issue. This spec defines the acceptance bar, not a duplicate of the bug report.

| # | Item | Done when |
|---|---|---|
| #37 | Fake routes | Routes deleted or behind `NODE_ENV !== 'production'` + auth + tenant check. No fake route in the production router. |
| #38 | Webhook signature | Raw body verified with the header OpenWA actually sends; constant-time compare with length check; missing/invalid signature → 401; no dev bypass. |
| #39 | `/api/orders/ids` crash | Handler cannot throw synchronously; regression test; process survives malformed input. |
| #40 | Encryption key | Key from env, validated at boot, no default; credentials encrypted at rest; rotation documented. |
| #41 | Carrier webhooks | Each provider verifies its real signature or uses a per-merchant secret; unsigned → 401; replay window enforced. |
| #42 | Deployment posture | No published datastores; no dev admin key; TLS via reverse proxy; backups + restore drill. |
| #43 | Async errors | One async wrapper or Express 5; no unhandled rejection kills the process. |
| #44 | Media limit | Route-specific limit; raw buffer preserved; large media accepted and processed async. |
| #45 | Order state guards | Transitions validated; `currentOrderId` cleared on terminal states. |
| #46 | Failed sends | Outbox states; no row says delivered unless the provider accepted it. |
| #47 | Prompt prefix spoofing | Customer text cannot impersonate a `[merchant]` block; tested with adversarial input. |
| #48 | Turn retry window | Retry window ≥ agent lock, or a queued retry; no silent drop. |
| #49 | PII to LLM providers | Documented providers/retention, minimization, deletion path, merchant-facing disclosure. |

## 3. Secrets and configuration

- One zod env schema per process. Boot fails on missing or weak values.
- Banned defaults: `dev-admin-key`, `whsec_dev`, `dev-internal-key`, `temp_test_key_123`, empty Redis password, default Postgres password.
- Secrets live in the platform secret store, never in the repo, never in compose files committed to git.
- `.env.example` contains names and formats only, never working values.
- Key rotation: encryption key versioned (`v1:...`), decrypt supports old versions, re-encrypt job documented.
- CI secret scanning (gitleaks) on every push.

## 4. CI pipeline

One workflow, path-filtered jobs, required on `dev`.

```
install      pnpm install --frozen-lockfile
typecheck    pnpm -r typecheck        (back, front, shared, contracts)
lint         eslint + prettier --check
unit         vitest (back, front, shared) + pytest (agent) + ruff
contract     export catalog, gen python, git diff --exit-code
db           prisma validate + migrate deploy on a throwaway Postgres + migrate diff
build        pnpm -r build (back, front, landing)
images       docker build back, front, agent (no push on PR)
e2e          Playwright smoke: login, dashboard, orders (nightly + main)
a11y         axe on shell + design route
security     gitleaks + pnpm audit --prod (non-blocking report)
```

Rules:

- `lint` scripts must actually lint. Remove `echo 'lint ok'`.
- 14 dark agent tests are fixed or deleted with a reason; no suppressed failures.
- Branch protection on `dev`: required checks, one review, no force push.
- PR template: what changed, how tested, risk, rollback.
- Every migration runs in CI against an empty DB and a seeded DB.

## 5. Production images and compose

- Multi-stage builds. Builder installs dev deps and compiles; runtime copies artifacts and production deps only.
- Non-root user. Read-only root filesystem where possible. No `tsx watch`, no Vite dev server, no source bind mounts.
- `back` runs `node dist/index.api.js` and `node dist/index.worker.js`; `prisma migrate deploy` is a separate one-shot job.
- `front` is static files served by nginx or the platform CDN, with cache headers and security headers.
- `compose.prod.yml`: internal network, no published Postgres/Redis/OpenWA, healthchecks, restart policies, resource limits, log rotation.
- Reverse proxy terminates TLS, sets HSTS, forwards only 80/443.
- `helmet`, explicit CORS allowlist, `trust proxy`, request timeout, body limits per route.

## 6. Data protection

- PII inventory: phone, name, address, message content, media, tokens.
- Minimize what reaches LLM providers: send only what the turn needs; no full history if a summary suffices.
- Retention: messages and media per merchant policy; `AgentTurn` 30 days; webhook raw events 7 days.
- Deletion: merchant/customer deletion path removes messages, media, sessions, and provider copies where possible.
- Media access: authenticated, tenant-scoped, signed URLs. No public `/uploads`.
- Git history: purge the committed customer photo; rotate anything exposed.
- Logs: redact phone, tokens, OTP, address; no message bodies.

## 7. Release checklist

Before any production deploy:

- [ ] All P0 issues closed.
- [ ] CI green on the release commit; branch protection active.
- [ ] `prisma migrate deploy` tested on a restored production copy.
- [ ] Backup taken and restore verified.
- [ ] Secrets present in the platform store; no defaults; env schema passes.
- [ ] `compose.prod.yml` reviewed: no published datastore, no dev flags.
- [ ] TLS, HSTS, CORS allowlist, rate limits verified from outside.
- [ ] Webhook signature verified with a real provider payload and a tampered one.
- [ ] Health and readiness probes return the right codes.
- [ ] Rollback: previous image tag and migration plan documented.
- [ ] Incident contact and runbook linked.

## 8. Acceptance criteria

- [ ] No P0 from `PROJECT_REPORT.md` remains open.
- [ ] CI is required on `dev` and covers typecheck, lint, unit, agent tests, contract parity, migrations, builds, and images.
- [ ] `lint` is real; no suppressed test failures.
- [ ] No secret default in code; boot fails closed.
- [ ] No datastore or dev tool published in production.
- [ ] Production images are multi-stage, non-root, and run compiled code.
- [ ] Webhook verification uses the raw body and fails closed.
- [ ] Media is served only through authenticated, tenant-scoped URLs.
- [ ] PII retention and deletion are documented and implemented.
- [ ] Backup and restore are tested, not just documented.
- [ ] A fresh machine can deploy from the README in under 30 minutes.
