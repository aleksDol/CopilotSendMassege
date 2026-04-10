FROM node:22-alpine AS base

WORKDIR /repo

# Install dependencies with pnpm
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm -w install --frozen-lockfile

RUN pnpm --filter @repo/leadradar-worker build

CMD ["pnpm", "--filter", "@repo/leadradar-worker", "start"]

