# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --no-frozen-lockfile

FROM base AS web
WORKDIR /app/apps/web
CMD ["pnpm", "dev"]

FROM base AS api
WORKDIR /app/apps/api
CMD ["pnpm", "dev"]

FROM base AS ai-worker
WORKDIR /app/apps/ai-worker
CMD ["pnpm", "dev"]
