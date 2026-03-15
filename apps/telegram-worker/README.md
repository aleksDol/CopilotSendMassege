# telegram-worker

Internal Telegram integration worker for MVP account connection and initial sync.

## Internal endpoints
- `GET /health`
- `POST /internal/telegram/start-login`
- `POST /internal/telegram/verify-code`
- `POST /internal/telegram/verify-password`
- `POST /internal/telegram/sync`
- `POST /internal/telegram/send-message`

All `/internal/*` routes require header:

```http
x-internal-token: <INTERNAL_API_TOKEN>
```

## Required env vars
- `DATABASE_URL`
- `INTERNAL_API_TOKEN`
- `API_INTERNAL_URL`
- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `TELEGRAM_SESSION_ENCRYPTION_KEY`
- `TELEGRAM_INITIAL_DIALOG_LIMIT` (optional, default `100`)
- `TELEGRAM_INITIAL_MESSAGES_PER_DIALOG` (optional, default `50`)
- `TELEGRAM_WORKER_HOST` (optional, default `0.0.0.0`)
- `TELEGRAM_WORKER_PORT` (optional, default `8080`)

## Run locally
```bash
cd apps/telegram-worker
pip install -e .
python main.py
```
