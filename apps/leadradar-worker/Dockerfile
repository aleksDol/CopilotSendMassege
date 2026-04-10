# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS builder

ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @repo/db prisma:generate
RUN pnpm --filter @repo/ai-core build \
  && pnpm --filter @repo/api build
RUN pnpm --filter @repo/leadradar-worker build
RUN pnpm prune --prod

FROM node:20-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app ./

EXPOSE 8092
CMD ["node", "apps/leadradar-worker/dist/index.js"]

