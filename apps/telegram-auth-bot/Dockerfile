FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/telegram-auth-bot/package.json ./apps/telegram-auth-bot/
COPY packages/config/package.json ./packages/config/
RUN pnpm install --frozen-lockfile --filter @repo/telegram-auth-bot...

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/telegram-auth-bot/node_modules ./apps/telegram-auth-bot/node_modules
COPY . .
RUN pnpm --filter @repo/telegram-auth-bot build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/telegram-auth-bot/dist ./dist
COPY --from=builder /app/apps/telegram-auth-bot/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]
