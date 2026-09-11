#!/bin/sh
set -e

echo "[ecom_agent] starting (pid $$)"

# Docker Compose injects env via env_file; fall back to a local .env if present
# (e.g. when the image is run directly outside Compose).
if [ -f /app/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /app/.env
  set +a
fi

# Redacted diagnostics — credentials inside DATABASE_URL are masked.
db_url=$(printf '%s' "${DATABASE_URL:-}" | sed -E 's#(//)[^:@]+(:[^@]+)?@#\1***@#')
echo "[ecom_agent] AGENT_GRPC_ADDR=${AGENT_GRPC_ADDR:-0.0.0.0:50052}"
echo "[ecom_agent] DATABASE_URL=${db_url:-<unset>}"
echo "[ecom_agent] REDIS_URL=${REDIS_URL:-redis://redis:6379}"
echo "[ecom_agent] OPENWA_URL=${OPENWA_URL:-http://openwa:2785}"
echo "[ecom_agent] GROQ_API_KEY=${GROQ_API_KEY:+<set>} GOOGLE_API_KEY=${GOOGLE_API_KEY:+<set>} LANGSMITH_API_KEY=${LANGSMITH_API_KEY:+<set>}"

# M1 placeholder: keep the container healthy until Task 4 boots the
# AgentService gRPC server.
#
# Task 4: boot the AgentService gRPC server (Health + ProcessMessage).
echo "[ecom_agent] starting AgentService gRPC server"
exec python -m server