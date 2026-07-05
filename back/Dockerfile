FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

ENV CI=true

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY back/package.json ./back/package.json
COPY shared/package.json ./shared/package.json
COPY front/package.json ./front/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN ./back/node_modules/.bin/prisma generate --schema=back/prisma/schema.prisma

EXPOSE 3000

WORKDIR /app/back
CMD sh -c "npx prisma generate --schema=prisma/schema.prisma && ./node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma && ./node_modules/.bin/tsx watch src/index.ts"
