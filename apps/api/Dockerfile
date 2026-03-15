# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS builder

ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @repo/ai-core build \
  && pnpm --filter @repo/api build \
  && pnpm --filter @repo/db prisma:generate
RUN pnpm --filter @repo/api deploy --prod /prod/api

FROM node:20-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /prod/api ./

EXPOSE 4000
CMD ["node", "dist/index.js"]
