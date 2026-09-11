FROM python:3.12-slim

# CA certificates keep PyPI reachable over TLS; no build toolchain is needed
# because the pinned deps all ship manylinux wheels for 3.12.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Non-root runtime user.
RUN useradd --create-home --uid 10001 appuser

COPY . .
RUN chmod +x /app/entrypoint.sh \
    && chown -R appuser:appuser /app

USER appuser

# M1: gRPC agent port (Task 4). Internal network only — not published to host.
EXPOSE 50052

ENTRYPOINT ["/app/entrypoint.sh"]