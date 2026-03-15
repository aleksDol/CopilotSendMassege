# Конфигурация при деплое: что где указывать

## Один файл для продакшена

При деплое используется **только один файл с переменными окружения** — **`.env.production`** в корне репозитория.

| Файл | Когда нужен |
|------|-------------|
| **`.env`** | Локальная разработка (и `docker compose up` без prod). |
| **`.env.example`** | Шаблон: скопировать в `.env` или `.env.production` и заполнить. |
| **`.env.production`** | **Деплой на сервер.** Его читает `docker-compose.prod.yml`. |

Никакие другие env-файлы для деплоя не нужны. Всё, что должно работать в проде (API, Web, Telegram-воркер, AI-воркер, БД, Redis, nginx), берёт переменные из **`.env.production`**.

---

## Как это устроено при деплое

Запуск стека в проде:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

- **`--env-file .env.production`** — откуда подставляются переменные в `docker-compose.prod.yml`.
- **`-f docker-compose.prod.yml`** — какой compose-файл использовать.

В `docker-compose.prod.yml` у сервисов **web**, **api**, **telegram-worker**, **ai-worker** указано:

```yaml
env_file:
  - .env.production
```

То есть все эти контейнеры получают переменные из одного и того же **`.env.production`**. Отдельные конфиги для каждого сервиса не нужны — достаточно заполнить один файл.

---

## Что обязательно поменять в `.env.production`

Скопируйте `.env.example` в `.env.production` и замените значения как минимум в этих пунктах.

### 1. Домен и URL (под ваш сайт)

```env
APP_DOMAIN=ваш-домен.com
APP_BASE_URL=https://ваш-домен.com
CORS_ORIGIN=https://ваш-домен.com
NEXT_PUBLIC_API_URL=https://ваш-домен.com/api
SSL_EMAIL=ваш-email@example.com
```

- **APP_DOMAIN** — домен, на котором открывается сайт (тот же, что в DNS).
- **APP_BASE_URL** — полный URL фронта (без слэша в конце).
- **CORS_ORIGIN** — тот же URL, что и фронт (схема + домен).
- **NEXT_PUBLIC_API_URL** — URL, по которому браузер ходит в API. В проде nginx отдаёт API по пути `/api`, поэтому формат: `https://ваш-домен.com/api`.
- **SSL_EMAIL** — email для Let's Encrypt (напоминания по сертификату).

### 2. База и кэш (внутренние имена контейнеров)

В проде контейнеры общаются по именам сервисов, не по `localhost`:

```env
POSTGRES_PASSWORD=надёжный_пароль_postgres
DATABASE_URL=postgresql://postgres:надёжный_пароль_postgres@postgres:5432/ai_sales_assistant
REDIS_URL=redis://redis:6379
```

- **postgres**, **redis** — имена сервисов из `docker-compose.prod.yml`. Менять не нужно.
- **POSTGRES_PASSWORD** и пароль в **DATABASE_URL** должны совпадать.

### 3. Секреты (обязательно свои значения)

```env
JWT_SECRET=случайная_строка_не_короче_32_символов
INTERNAL_API_TOKEN=случайная_строка_не_короче_16_символов
```

Генерировать свои (например: `openssl rand -base64 32`).

### 4. Внутренние URL сервитов (уже заданы в compose)

В самом `docker-compose.prod.yml` для контейнеров уже прописано:

- API ходит в Telegram-воркер: `TELEGRAM_WORKER_URL=http://telegram-worker:8080`
- Воркеры ходят в API: `API_INTERNAL_URL=http://api:4000`

В **`.env.production`** можно оставить так (они используются и при подстановке в compose):

```env
TELEGRAM_WORKER_URL=http://telegram-worker:8080
API_INTERNAL_URL=http://api:4000
```

Менять на другие значения нужно только если меняете имена сервисов или порты в `docker-compose.prod.yml`.

---

## Чтобы работали все функции

Заполните в **`.env.production`** те же группы переменных, что и для локальной разработки, но с продовыми значениями.

| Функция | Что указать в `.env.production` |
|--------|----------------------------------|
| Регистрация, логин, чаты, задачи, база знаний | Достаточно домена, БД, Redis, JWT_SECRET, INTERNAL_API_TOKEN, CORS_ORIGIN, NEXT_PUBLIC_API_URL (см. выше). |
| Подсказки ИИ в чатах | **OPENAI_API_KEY**, при необходимости OPENAI_MODEL_REPLY, OPENAI_BASE_URL. |
| Подключение Telegram и синк чатов | **TELEGRAM_API_ID**, **TELEGRAM_API_HASH**, **TELEGRAM_SESSION_ENCRYPTION_KEY** (те же, что в [ENV-GUIDE.md](./ENV-GUIDE.md)). INTERNAL_API_TOKEN и API_INTERNAL_URL уже учтены в compose. |
| Оплата (Stripe) | **STRIPE_SECRET_KEY**, **STRIPE_WEBHOOK_SECRET**, **STRIPE_PRICE_PRO**, **STRIPE_PRICE_TEAM**, **NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY**. Webhook в Stripe указать на `https://ваш-домен.com/api/webhooks/stripe`. |

Подробно, что означает каждая переменная и откуда её взять — в [ENV-GUIDE.md](./ENV-GUIDE.md). Для деплоя важно только подставлять **продовые** URL и секреты и использовать имена хостов **postgres**, **redis**, **api**, **telegram-worker** там, где в шаблоне указано.

---

## Краткий чеклист перед первым деплоем

1. Создать **`.env.production`** (скопировать из `.env.example`).
2. Заменить **APP_DOMAIN**, **APP_BASE_URL**, **CORS_ORIGIN**, **NEXT_PUBLIC_API_URL**, **SSL_EMAIL** на свой домен и email.
3. Задать **POSTGRES_PASSWORD** и тот же пароль в **DATABASE_URL** (хост в URL оставить `postgres`, порт `5432`).
4. Задать **JWT_SECRET** и **INTERNAL_API_TOKEN** (уникальные случайные строки нужной длины).
5. Для ИИ — **OPENAI_API_KEY**.
6. Для Telegram — **TELEGRAM_API_ID**, **TELEGRAM_API_HASH**, **TELEGRAM_SESSION_ENCRYPTION_KEY**.
7. Для оплаты — все переменные Stripe и в Stripe Dashboard указать webhook на `https://ваш-домен.com/api/webhooks/stripe`.
8. Запуск:  
   `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build`
9. После первого запуска при необходимости применить миграции:  
   `docker compose --env-file .env.production -f docker-compose.prod.yml exec api pnpm db:migrate:deploy`

Итого: для деплоя нужен **один** конфиг — **`.env.production`**; остальные env-файлы для продакшена не используются.
