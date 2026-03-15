# @repo/api

Fastify + TypeScript API skeleton for AI Sales Assistant.

## Run locally
1. Ensure `.env` exists at repo root with required values:
   `DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`, `TELEGRAM_WORKER_URL`, `INTERNAL_API_TOKEN`,
   `FOLLOW_UP_UNANSWERED_HOURS`, `FOLLOW_UP_WARM_LEAD_HOURS`, `DASHBOARD_ACTIVITY_WINDOW_DAYS`,
   `OPENAI_API_KEY`, `OPENAI_MODEL_REPLY`, `OPENAI_BASE_URL`, `AI_PROMPT_VERSION`.
2. Install workspace deps:
   ```bash
   pnpm install
   ```
3. Start API in dev mode:
   ```bash
   pnpm --filter @repo/api dev
   ```

## Routes
- `GET /health`
- `GET /health/ready`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me` (protected)
- `GET /company/current` (protected)
- `GET /users/me` (protected)
- `PATCH /users/me` (protected)
- `POST /telegram/connect/start` (protected)
- `POST /telegram/connect/verify-code` (protected)
- `POST /telegram/connect/verify-password` (protected)
- `GET /telegram/account` (protected)
- `POST /telegram/sync` (protected)
- `GET /conversations` (protected)
- `GET /conversations/:id/messages` (protected)
- `POST /conversations/:id/messages` (protected)
- `GET /conversations/:id/tasks` (protected)
- `GET /tasks` (protected)
- `POST /tasks` (protected)
- `PATCH /tasks/:id` (protected)
- `POST /tasks/:id/complete` (protected)
- `POST /tasks/:id/reopen` (protected)
- `GET /dashboard/overview` (protected)
- `POST /conversations/:id/ai/suggest-reply` (protected)
- `GET /conversations/:id/ai/suggestions` (protected)
- `POST /ai/suggestions/:id/accept` (protected)
- `POST /ai/suggestions/:id/reject` (protected)
- `POST /internal/telegram/events/message` (internal token)
- `POST /internal/follow-up/run` (internal token)

## Auth
Use bearer token:

```http
Authorization: Bearer <token>
```
