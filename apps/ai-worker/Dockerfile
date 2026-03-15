# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS builder

ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @repo/ai-worker build
RUN mkdir -p /prod/ai-worker && cp -r apps/ai-worker/dist apps/ai-worker/package.json /prod/ai-worker/ && cp -r node_modules /prod/ai-worker/

FROM node:20-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /prod/ai-worker ./

EXPOSE 8090
CMD ["node", "dist/index.js"]
