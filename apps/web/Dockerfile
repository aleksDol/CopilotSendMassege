# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS builder

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SALES_TELEGRAM_URL
# Inlined at `next build`; override with --build-arg if needed
ARG NEXT_PUBLIC_YANDEX_METRIKA_ID=108223264
ARG NEXT_PUBLIC_TOP_MAIL_RU_ID=3752150
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
ENV NEXT_PUBLIC_SALES_TELEGRAM_URL=${NEXT_PUBLIC_SALES_TELEGRAM_URL}
ENV NEXT_PUBLIC_YANDEX_METRIKA_ID=${NEXT_PUBLIC_YANDEX_METRIKA_ID}
ENV NEXT_PUBLIC_TOP_MAIL_RU_ID=${NEXT_PUBLIC_TOP_MAIL_RU_ID}
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @repo/web build
RUN mkdir -p /app/apps/web/public

FROM node:20-alpine AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
