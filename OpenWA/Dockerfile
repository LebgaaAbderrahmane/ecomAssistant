# OpenWA - Dockerfile
# Multi-stage build for production-ready image

# ===== Stage 1: Builder =====
# Pin the builder to the BUILD host's platform (not the target's). It only produces arch-INDEPENDENT
# artifacts (the NestJS dist/ JS and the static dashboard SPA), so it never needs to run emulated for
# the non-native target. On a multi-arch buildx build this avoids QEMU emulating the whole npm ci +
# Vite build for arm64 — which is slow AND is where the arm64 lightningcss (Vite 8's native CSS
# minifier) optional dependency fails to install ("Cannot find module lightningcss.linux-arm64-gnu.node").
# The per-arch runtime deps are installed natively in the target-platform production stage below.
ARG BUILDPLATFORM=linux/amd64
FROM --platform=$BUILDPLATFORM docker.io/node:22-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install all dependencies INCLUDING devDependencies — the build needs them (`nest` from
# @nestjs/cli, plus `vite`/`typescript` for the dashboard). `--include=dev` is REQUIRED, not
# cosmetic: npm omits devDependencies whenever NODE_ENV=production is present in the build env.
# Coolify (and similar PaaS) promote every ${VAR} referenced in the compose file to a build-time
# variable, so docker-compose.yml's `NODE_ENV=${NODE_ENV:-production}` leaks NODE_ENV=production
# into this stage and a bare `npm ci` would skip @nestjs/cli → `sh: 1: nest: not found` (exit 127).
# (docker-compose.dev.yml hardcodes NODE_ENV=development, which is why the dev build never hit this.)
RUN npm ci --include=dev

# Copy source code
COPY . .

# Build the API (dist/). The root `npm ci` above ran before the dashboard source was
# copied, so its postinstall hook skipped the dashboard deps — we don't need the
# dashboard anyway since we use the OpenWA API directly.
RUN npm run build

# ===== Stage 2: Production =====
FROM docker.io/node:22-slim AS production

# Install runtime essentials (baileys engine doesn't need Chrome)
RUN apt-get update && apt-get install -y \
    dumb-init \
    gosu \
    curl \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Create app user for security
RUN groupadd -r openwa && useradd -r -g openwa openwa

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create data directories with correct ownership
RUN mkdir -p ./data/sessions ./data/media && \
    chown -R openwa:openwa /app

# The non-root openwa user has no home of its own (`useradd -r`, no -m). Chromium resolves the home
# dir from the passwd entry via glib's getpwuid() — it IGNORES $HOME — so it tries to read/write
# /home/openwa, which does not exist. On hardened/read-only hosts that makes the browser HARD-CRASH
# at launch (SIGTRAP/int3, logged as "chrome_crashpad_handler: --database is required"). The robust
# fix is to point Chromium's config + cache at writable, pre-created dirs via XDG_* (honored directly,
# bypassing the passwd lookup); docker-entrypoint.sh creates them owned by openwa. On a read_only
# rootfs these live on the tmpfs /tmp. HOME is kept for any other HOME-relative tooling. See #254/#242.
ENV HOME=/app/data
ENV XDG_CONFIG_HOME=/tmp/.config
ENV XDG_CACHE_HOME=/tmp/.cache

# Copy entrypoint: runs as root to fix named-volume ownership, then drops to openwa via gosu
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose port
EXPOSE 2785

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:2785/api/health/ready || exit 1

# dumb-init is PID 1 and handles signal forwarding.
# It execs docker-entrypoint.sh (as root), which fixes volume ownership and
# then drops to the openwa user via gosu before starting the node process.
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main"]
