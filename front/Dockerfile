FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

ENV CI=true

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY front/package.json ./front/package.json
COPY shared/package.json ./shared/package.json
COPY back/package.json ./back/package.json

RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 5173

WORKDIR /app/front
CMD sh -c "./node_modules/.bin/vite --host 0.0.0.0"
