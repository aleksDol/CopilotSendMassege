# AI Sales Assistant для Telegram-чатов

Монорепозиторий для MVP SaaS: ассистент по продажам с интеграцией Telegram.

## Стек
- pnpm workspaces + Turbo
- TypeScript в Node.js-сервисах и общих пакетах
- Next.js (App Router) для веб-интерфейса
- Fastify для API
- Python (FastAPI + Telethon) для Telegram-воркера
- Prisma для работы с БД
- Docker Compose: Postgres, Redis и сервисы приложения

## Структура репозитория
- `apps/web` — веб-интерфейс (Next.js)
- `apps/api` — API (Fastify), `GET /health`
- `apps/ai-worker` — фоновый AI-воркер
- `apps/telegram-worker` — воркер Telegram (Python)
- `packages/db` — схема Prisma и скрипты БД
- `packages/shared` — общие типы и константы
- `packages/ai-core` — интерфейсы AI-провайдеров
- `packages/config` — общий tsconfig/eslint

## Требования
- Node.js 20+
- pnpm 10+
- Docker и Docker Compose
- Python 3.11+ (если запускаете telegram-worker локально без Docker)

## Локальный запуск
1. Установить зависимости:
   ```bash
   pnpm install
   ```
2. Создать файл окружения из шаблона:
   ```bash
   cp .env.example .env
   ```
3. Сгенерировать Prisma-клиент:
   ```bash
   pnpm db:generate
   ```
4. Запустить инфраструктуру (Postgres, Redis):
   ```bash
   docker compose up -d postgres redis
   ```
5. Применить миграции:
   ```bash
   pnpm db:migrate
   ```
6. Запустить приложения в режиме разработки:
   ```bash
   pnpm dev
   ```

Подробнее по переменным окружения: [docs/ENV-GUIDE.md](docs/ENV-GUIDE.md).

## Запуск через Docker Compose (всё в контейнерах)
```bash
docker compose up --build
```

Сервисы:
- Веб: `http://localhost:${WEB_PORT:-3000}`
- API (health): `http://localhost:${API_PORT:-4000}/health`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

## Полезные команды
- `pnpm build` — сборка всех пакетов
- `pnpm lint` — линт по всем воркспейсам
- `pnpm --filter @repo/api dev` — только API
- `pnpm --filter @repo/web dev` — только веб
- `pnpm --filter @repo/ai-worker dev` — только AI-воркер
- `pnpm db:migrate` — миграции Prisma (dev)
- `pnpm db:migrate:deploy` — применить миграции (прод)
- `pnpm db:seed` — демо-данные
- `pnpm db:studio` — Prisma Studio

## Фронтенд (apps/web)
Маршруты:
- Публичные: `/login`, `/register`
- Онбординг: `/onboarding`
- Приложение: `/dashboard`, `/chats`, `/tasks`
- Настройки: `/settings/knowledge`, `/settings/reply-policy`, `/settings/telegram`, `/settings/billing`, `/settings/team`

Используются: оболочка (сайдбар + шапка), JWT-авторизация, TanStack Query, подсказки ИИ в чатах, задачи, подключение Telegram.

Переменные для веба: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

Проверки:
```bash
pnpm --filter @repo/web typecheck
pnpm --filter @repo/web build
```

## База данных (Prisma)
1. Запустить Postgres (например через Docker).
2. Применить миграции:
   ```bash
   pnpm db:migrate
   ```
3. Сгенерировать клиент:
   ```bash
   pnpm db:generate
   ```
4. При необходимости — демо-данные:
   ```bash
   pnpm db:seed
   ```

## API (авторизация и рабочее пространство)
В `apps/api`:
- JWT: `/auth/register`, `/auth/login`, `/auth/me`
- Контекст по workspace: `request.currentUser.companyId`
- Эндпоинты: `/company/current`, `/users/me`, Telegram (`/telegram/connect/*`, `/telegram/account`, `/telegram/sync`)
- Health: `/health`, `/health/ready`

Необходимые переменные окружения API перечислены в [docs/ENV-GUIDE.md](docs/ENV-GUIDE.md).

## Интеграция Telegram
- `apps/telegram-worker` — внутренний сервис на FastAPI + Telethon.
- API обращается к воркеру по внутренним эндпоинтам (заголовок `x-internal-token`).
- Сессия Telegram хранится в зашифрованном виде в `TelegramAccount.sessionDataEncrypted`.
- При первой синхронизации события сообщений отправляются в API (`/internal/telegram/events/message`), создаются диалоги, сообщения и участники.
- Доступны эндпоинты: `GET /conversations`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages`.

Переменные для Telegram: см. [docs/ENV-GUIDE.md](docs/ENV-GUIDE.md).

## Замечания
- Telegram: MVP (подключение, верификация, первичная синхронизация), не полноценный realtime.
- Подсказки ИИ: ручной режим (предложить/принять/отклонить), не автопилот.

## Продакшен (один VPS)
Стек на одном хосте:
- `nginx` — обратный прокси и SSL
- `web` — Next.js
- `api` — Fastify
- `telegram-worker` — FastAPI + Telethon
- `ai-worker` — фоновый Node-сервис
- `postgres`, `redis`, `postgres-backup`

Всё поднимается через Docker Compose: [docker-compose.prod.yml](docker-compose.prod.yml).

Конфигурация деплоя и переменные: [docs/DEPLOY-CONFIG.md](docs/DEPLOY-CONFIG.md).

## Запуск продакшена
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

- nginx слушает 80/443.
- Сервисы приложения доступны только внутри сети (`web:3000`, `api:4000`, `telegram-worker:8080`, `ai-worker:8090`).
- Postgres и Redis наружу не пробрасываются.

Health:
- web: `GET /health`
- api: `GET /health`, `GET /health/ready`, `GET /metrics`
- telegram-worker, ai-worker: `GET /health`, `GET /metrics`

## Nginx и SSL
Конфиги: `deploy/nginx/nginx.conf`, `deploy/nginx/templates/http.conf.template`, `deploy/nginx/templates/https.conf.template`, `deploy/nginx/entrypoint.sh`.

Если есть сертификаты Let's Encrypt в `/etc/letsencrypt/live/$APP_DOMAIN`, включается HTTPS и редирект 80→443. Иначе nginx стартует только по HTTP.

Выпуск сертификата (когда DNS указывает на сервер):
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile ops run --rm certbot
```

Перезапуск nginx:
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml restart nginx
```

## Бэкапы Postgres
Скрипт: [scripts/backup-postgres.sh](scripts/backup-postgres.sh). Контейнер `postgres-backup` по расписанию (по умолчанию раз в 24 ч) делает `pg_dump`. Хранение: `BACKUP_RETENTION_DAYS` (по умолчанию 7).

Ручной бэкап:
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm postgres-backup /scripts/backup-postgres.sh
```

## Логи и мониторинг
- API: структурированные JSON-логи (Fastify/Pino) в stdout.
- Воркеры и nginx пишут логи в stdout/stderr. Ротация логов задаётся в Docker.

Команды:
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f nginx
```

## Деплой на VPS
1. Установить Docker Engine и Docker Compose.
2. Клонировать репозиторий на сервер.
3. Создать и заполнить `.env.production` (на основе `.env.example`). Подробно: [docs/DEPLOY-CONFIG.md](docs/DEPLOY-CONFIG.md).
4. Запустить стек:
   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
   ```
5. Проверить статус:
   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml ps
   ```
6. Настроить DNS (APP_DOMAIN → IP сервера).
7. Выпустить сертификат Let's Encrypt (команда certbot выше), перезапустить nginx.
8. При необходимости применить миграции:
   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml exec api pnpm db:migrate:deploy
   ```

Опционально: systemd-юнит для автозапуска при перезагрузке.

## Производительность и контроль затрат на AI
- Кэширование подсказок по хешу промпта (повторные запросы без вызова LLM).
- Таймаут и лимит контекста: `AI_REQUEST_TIMEOUT_MS`, `AI_MAX_CONTEXT_MESSAGES`.
- Redis-кэш для списка диалогов, дашборда, базы знаний и политики ответов (`REDIS_CACHE_TTL`).
- Эндпоинт `GET /usage/overview` — статистика использования ИИ по компании.
- Курсорная пагинация сообщений: `GET /conversations/:id/messages?cursor=...&limit=50`.
- Очереди в ai-worker (BullMQ): `ai-generation`, `follow-up-scan`, `telegram-sync`. Настройки: `AI_WORKER_CONCURRENCY`, `TELEGRAM_WORKER_CONCURRENCY`.

## Монетизация (Stripe)
- Подписки по workspace: сущности `Subscription`, `UsageRecord`, `TeamInvite`.
- API: `GET /billing/subscription`, `GET /billing/usage`, `POST /billing/checkout-session`, `POST /billing/portal`, `POST /webhooks/stripe`.
- Команда: `GET /team`, приглашения, удаление участников.
- Лимиты по использованию ИИ: проверка перед вызовом провайдера, при превышении — `ai_limit_reached`.
- Страницы в приложении: `/settings/billing`, `/settings/team`.

Переменные Stripe и настройка вебхука описаны в [docs/ENV-GUIDE.md](docs/ENV-GUIDE.md) и [docs/DEPLOY-CONFIG.md](docs/DEPLOY-CONFIG.md).
