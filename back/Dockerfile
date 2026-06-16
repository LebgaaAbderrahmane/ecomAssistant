FROM node:22-alpine

RUN apk add --no-cache openssl

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

ENV CI=true

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY back/package.json ./back/package.json
COPY shared/package.json ./shared/package.json
COPY front/package.json ./front/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run --filter @ecomassistant/shared build
RUN npx prisma generate

EXPOSE 3000

WORKDIR /app/back
CMD sh -c "./node_modules/.bin/tsx watch src/index.ts"
