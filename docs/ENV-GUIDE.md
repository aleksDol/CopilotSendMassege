# Справочник по переменным окружения (.env)

Что указывать в каждом пункте, для чего он нужен и откуда брать данные.

---

## Обязательные для базового запуска (API + Web + БД)

Без этих переменных API не стартует.

| Переменная | Что указать | Для чего | Где взять |
|------------|-------------|----------|-----------|
| **DATABASE_URL** | `postgresql://postgres:postgres@localhost:5432/ai_sales_assistant` | Подключение к PostgreSQL | Локально: после `docker compose up -d postgres` — оставить как в примере. На сервере: подставить хост/порт/логин/пароль/имя БД из вашего Postgres. |
| **REDIS_URL** | `redis://localhost:6379` | Подключение к Redis (кэш, очереди) | Локально: после `docker compose up -d redis` — оставить так. На сервере: хост и порт вашего Redis. |
| **JWT_SECRET** | Строка **не короче 32 символов** | Подпись JWT-токенов (сессии пользователей) | Придумать самому: случайная строка 32+ символов. Например: `openssl rand -base64 32` или любой пароль/фраза длиной от 32 символов. |
| **TELEGRAM_WORKER_URL** | `http://localhost:8080` (локально) или URL воркера | Адрес сервиса Telegram-воркера | Локально: если telegram-worker не запущен — API всё равно стартует, но «Подключение Telegram» в настройках не будет работать. Укажите `http://localhost:8080` для локального воркера. |
| **INTERNAL_API_TOKEN** | Строка **не короче 16 символов** | Секретный токен для вызовов между API и воркерами (Telegram, AI) | Придумать самому: случайная строка 16+ символов. Должен совпадать в API и в telegram-worker/ai-worker. |
| **CORS_ORIGIN** | `http://localhost:3000` (локально) | Разрешённый origin для запросов с фронта | Локально: URL, на котором крутится Next.js (обычно `http://localhost:3000`). В проде — ваш домен фронта, например `https://app.example.com`. |

---

## Общие и порты

| Переменная | Что указать | Для чего | Где взять |
|------------|-------------|----------|-----------|
| **NODE_ENV** | `development` или `production` | Режим работы (логи, ошибки) | Локально: `development`. На проде: `production`. |
| **API_PORT** / **PORT** | `4000` | Порт, на котором слушает API | По умолчанию 4000. Менять, если порт занят. |
| **WEB_PORT** | `3000` | Порт Next.js (для docker-compose) | По умолчанию 3000. |
| **APP_DOMAIN** | `localhost` (локально) или ваш домен | Домен приложения (для nginx/SSL) | Локально: `localhost`. Прод: например `app.example.com`. |
| **APP_BASE_URL** | `http://localhost:3000` (локально) | Полный URL фронта (ссылки в письмах, Stripe redirect) | Локально: `http://localhost:3000`. Прод: `https://ваш-домен`. |

---

## Фронт (Next.js)

| Переменная | Что указать | Для чего | Где взять |
|------------|-------------|----------|-----------|
| **NEXT_PUBLIC_API_URL** | `http://localhost:4000` (локально) | URL API для запросов с браузера | Локально: адрес вашего API. Прод: публичный URL API. |
| **NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY** | `pk_test_...` или `pk_live_...` | Публичный ключ Stripe (оплата в браузере) | [Stripe Dashboard](https://dashboard.stripe.com/apikeys) → Publishable key. Без него страница «Оплата» не сможет инициировать оплату. |

---

## База данных и кэш (Docker / инфра)

| Переменная | Что указать | Для чего | Где взять |
|------------|-------------|----------|-----------|
| **POSTGRES_DB** | `ai_sales_assistant` | Имя базы в контейнере Postgres | Оставить как в примере или своё имя БД (должно совпадать с именем в DATABASE_URL). |
| **POSTGRES_USER** | `postgres` | Пользователь Postgres | Обычно `postgres` локально. В DATABASE_URL должен быть тот же пользователь. |
| **POSTGRES_PASSWORD** | `postgres` (или свой пароль) | Пароль Postgres | Задать самому. В DATABASE_URL должен быть тот же пароль. |

---

## ИИ (подсказки ответов в чатах)

| Переменная | Что указать | Для чего | Где взять |
|------------|-------------|----------|-----------|
| **OPENAI_API_KEY** | `sk-...` | Ключ API OpenAI для генерации ответов | [OpenAI API Keys](https://platform.openai.com/api-keys) — создать ключ. Без него кнопка «Предложить ответ» в чатах не будет вызывать ИИ. |
| **OPENAI_MODEL_REPLY** | `gpt-4o-mini` (или другая модель) | Модель для генерации подсказок | Рекомендуется `gpt-4o-mini` (дешевле). Можно `gpt-4o`, `gpt-4-turbo` и т.д. |
| **OPENAI_BASE_URL** | `https://api.openai.com/v1` | URL API OpenAI | По умолчанию официальный OpenAI. Для совместимых провайдеров (Azure, локальные и т.д.) — их base URL. |
| **AI_PROMPT_VERSION** | `v1` | Версия промптов (для кэша/логики) | Оставить `v1`, менять при смене логики промптов. |
| **AI_REQUEST_TIMEOUT_MS** | `12000` | Таймаут запроса к ИИ (мс) | По умолчанию 12 сек. |
| **AI_MAX_CONTEXT_MESSAGES** | `20` | Сколько последних сообщений передавать в контекст ИИ | Число от 1 до 100. |

---

## Оплата (Stripe)

Нужны только если используете страницу «Оплата» и тарифы Pro/Team.

| Переменная | Что указать | Для чего | Где взять |
|------------|-------------|----------|-----------|
| **STRIPE_SECRET_KEY** | `sk_test_...` или `sk_live_...` | Секретный ключ Stripe (бэкенд) | [Stripe Dashboard](https://dashboard.stripe.com/apikeys) → Secret key. |
| **STRIPE_WEBHOOK_SECRET** | `whsec_...` | Подпись вебхуков Stripe | [Stripe Webhooks](https://dashboard.stripe.com/webhooks): создать endpoint (например `https://ваш-api.com/webhooks/stripe`), скопировать Signing secret. Локально можно использовать Stripe CLI: `stripe listen --forward-to localhost:4000/webhooks/stripe`. |
| **STRIPE_PRICE_PRO** | `price_...` | Price ID тарифа Pro | [Stripe Products](https://dashboard.stripe.com/products): создать продукт Pro, добавить цену, скопировать Price ID. |
| **STRIPE_PRICE_TEAM** | `price_...` | Price ID тарифа Team | Аналогично — продукт/цена для тарифа Team. |

Без Stripe: регистрация, чаты, задачи, база знаний, Telegram (если настроен воркер) работают; страница «Оплата» и лимиты по тарифам — нет.

---

## Telegram (подключение аккаунта и синхронизация чатов)

Нужны для работы «Подключение Telegram» и синка диалогов. Данные берутся с my.telegram.org.

| Переменная | Что указать | Для чего | Где взять |
|------------|-------------|----------|-----------|
| **TELEGRAM_API_ID** | Число, например `12345678` | ID приложения в Telegram API | [my.telegram.org](https://my.telegram.org) → API development tools → создать приложение → **App api_id**. |
| **TELEGRAM_API_HASH** | Строка, например `a1b2c3d4...` | Секрет приложения | Там же → **App api_hash**. |
| **TELEGRAM_SESSION_ENCRYPTION_KEY** | Строка **не короче 32 символов** | Шифрование сессии Telegram на диске | Придумать самому (32+ символов). Один раз задать и не менять, иначе старые сессии перестанут работать. |
| **TELEGRAM_INITIAL_DIALOG_LIMIT** | `100` | Сколько диалогов подтягивать при первой синхронизации | Число. По умолчанию 100. |
| **TELEGRAM_INITIAL_MESSAGES_PER_DIALOG** | `50` | Сколько сообщений загружать из каждого диалога при первой синхронизации | Число. По умолчанию 50. |

Важно: telegram-worker должен быть запущен (отдельно или в Docker), и в нём должны быть те же **TELEGRAM_API_ID**, **TELEGRAM_API_HASH**, **TELEGRAM_SESSION_ENCRYPTION_KEY**, **INTERNAL_API_TOKEN**, **API_INTERNAL_URL**.

---

## Внутренние URL и таймауты

| Переменная | Что указать | Для чего | Где взять |
|------------|-------------|----------|-----------|
| **API_INTERNAL_URL** | `http://localhost:4000` (локально) или внутренний URL API | URL API для вызовов с telegram-worker / ai-worker | Локально: `http://localhost:4000`. В Docker: обычно `http://api:4000`. |
| **TELEGRAM_WORKER_TIMEOUT_MS** | `15000` | Таймаут запросов API к telegram-worker (мс) | По умолчанию 15 сек. |

---

## Дашборд и follow-up

| Переменная | Что указать | Для чего | Где взять |
|------------|-------------|----------|-----------|
| **FOLLOW_UP_UNANSWERED_HOURS** | `24` | Через сколько часов считать диалог «без ответа» для follow-up | Часы. |
| **FOLLOW_UP_WARM_LEAD_HOURS** | `48` | Окно для «тёплых» лидов (follow-up) | Часы. |
| **DASHBOARD_ACTIVITY_WINDOW_DAYS** | `7` | За сколько дней считать активность на дашборде | Дни. |

---

## Кэш и воркеры

| Переменная | Что указать | Для чего | Где взять |
|------------|-------------|----------|-----------|
| **REDIS_CACHE_TTL** | `45` | Время жизни кэша в Redis (секунды) | Секунды, 5–600. |
| **AI_WORKER_CONCURRENCY** | `2` | Сколько задач ИИ обрабатывать параллельно в ai-worker | Число. |
| **TELEGRAM_WORKER_CONCURRENCY** | `2` | Ограничение параллельных операций в telegram-worker | Число. |

---

## Nginx / SSL / бэкапы (в основном для продакшена)

| Переменная | Что указать | Для чего | Где взять |
|------------|-------------|----------|-----------|
| **SSL_EMAIL** | Ваш email | Для Let's Encrypt (напоминания) | Любой ваш email. |
| **NGINX_CLIENT_MAX_BODY_SIZE** | `20m` | Макс. размер тела запроса | По умолчанию 20m. |
| **BACKUP_RETENTION_DAYS** | `7` | Сколько дней хранить бэкапы БД | Дни. |
| **POSTGRES_BACKUP_INTERVAL_SECONDS** | `86400` | Интервал бэкапов (секунды), 86400 = 1 раз в сутки | Секунды. |

---

## Минимальный .env для «всё кроме Telegram и оплаты»

Чтобы запустить только API + Web + БД + Redis и пользоваться регистрацией, чатами (без ИИ-подсказок), задачами, базой знаний:

```env
NODE_ENV=development
API_PORT=4000
WEB_PORT=3000
PORT=4000
APP_DOMAIN=localhost
APP_BASE_URL=http://localhost:3000

POSTGRES_DB=ai_sales_assistant
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_sales_assistant
REDIS_URL=redis://localhost:6379

JWT_SECRET=ваша_секретная_строка_длиной_не_менее_32_символов
INTERNAL_API_TOKEN=внутренний_токен_16_символов
CORS_ORIGIN=http://localhost:3000

TELEGRAM_WORKER_URL=http://localhost:8080
API_INTERNAL_URL=http://localhost:4000

NEXT_PUBLIC_API_URL=http://localhost:4000
```

**JWT_SECRET** и **INTERNAL_API_TOKEN** замените на свои случайные строки нужной длины.

Чтобы заработали:
- **Подсказки ИИ в чатах** — добавьте **OPENAI_API_KEY** (и при необходимости OPENAI_MODEL_REPLY, OPENAI_BASE_URL).
- **Подключение Telegram** — поднимите telegram-worker и добавьте **TELEGRAM_API_ID**, **TELEGRAM_API_HASH**, **TELEGRAM_SESSION_ENCRYPTION_KEY** (и те же ключи в конфиг telegram-worker).
- **Оплата и тарифы** — добавьте переменные Stripe (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_*, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).

Если какой-то сервис не запущен (например, telegram-worker или Redis), связанные с ним функции будут падать с ошибками подключения; остальное может работать при корректных URL и секретах.
