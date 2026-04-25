import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Load root .env so "pnpm --filter @repo/api dev" sees variables when run from monorepo root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
  ENABLE_LEADRADAR: booleanFromEnv.default(false),
  /**
   * When true, API enqueues LeadRadar jobs (async) instead of running LeadRadar in-process.
   * Keep default false for safe rollout.
   */
  ENABLE_LEADRADAR_QUEUE: booleanFromEnv.default(false),
  /**
   * Emergency fallback: allow running LeadRadar in API ingestion process.
   * Default true to preserve existing behavior when queue is disabled.
   */
  ENABLE_LEADRADAR_INGESTION_IN_API: booleanFromEnv.default(true),
  ENABLE_LEADRADAR_AUTHOR_PROFILE_MATCHING_ENABLED: booleanFromEnv.default(false),
  ENABLE_TG_GROUP_INGESTION: booleanFromEnv.default(false),
  TELEGRAM_WORKER_URL: z.string().url(),
  INTERNAL_API_TOKEN: z.string().min(16),
  TELEGRAM_WORKER_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  /** Longer timeout for resolve-chat-by-link (add LeadRadar source); avoids 504 when Telegram is slow. */
  TELEGRAM_WORKER_RESOLVE_CHAT_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),
  FOLLOW_UP_UNANSWERED_HOURS: z.coerce.number().int().positive().default(24),
  FOLLOW_UP_WARM_LEAD_HOURS: z.coerce.number().int().positive().default(48),
  CRM_IGNORED_SWEEP_ENABLED: booleanFromEnv.default(false),
  CRM_IGNORED_SWEEP_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  DASHBOARD_ACTIVITY_WINDOW_DAYS: z.coerce.number().int().positive().default(7),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL_REPLY: z.string().default("gpt-4o-mini"),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  AI_PROMPT_VERSION: z.string().default("v1"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_TEAM: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: booleanFromEnv.default(false),
  EMAIL_CODE_SECRET: z.string().min(16).default("replace_me_email_code_secret"),
  EMAIL_CODE_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  EMAIL_CODE_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
  EMAIL_CODE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
  AI_MAX_CONTEXT_MESSAGES: z.coerce.number().int().min(1).max(100).default(20),
  REDIS_CACHE_TTL: z.coerce.number().int().min(5).max(600).default(45),
  AI_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  TELEGRAM_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  /** LeadRadar: merge leads from same Telegram user across chats within this window (hours). */
  LEADRADAR_MULTI_CHAT_DEDUPE_WINDOW_HOURS: z.coerce.number().int().min(1).max(168).default(3),
  /** Score bonus when merging multi-chat activity into an existing lead. */
  LEADRADAR_MULTI_CHAT_SCORE_BONUS: z.coerce.number().int().min(0).max(500).default(35),
  /** Comma-separated emails allowed to use /admin API (empty = no platform admins). */
  ADMIN_EMAILS: z.string().optional().default("")
});

const parsedEnv = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT ?? process.env.API_PORT ?? 4000,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  ENABLE_LEADRADAR: process.env.ENABLE_LEADRADAR,
  ENABLE_LEADRADAR_QUEUE: process.env.ENABLE_LEADRADAR_QUEUE,
  ENABLE_LEADRADAR_INGESTION_IN_API: process.env.ENABLE_LEADRADAR_INGESTION_IN_API,
  ENABLE_LEADRADAR_AUTHOR_PROFILE_MATCHING_ENABLED: process.env.ENABLE_LEADRADAR_AUTHOR_PROFILE_MATCHING_ENABLED,
  ENABLE_TG_GROUP_INGESTION: process.env.ENABLE_TG_GROUP_INGESTION,
  TELEGRAM_WORKER_URL: process.env.TELEGRAM_WORKER_URL,
  INTERNAL_API_TOKEN: process.env.INTERNAL_API_TOKEN,
  TELEGRAM_WORKER_TIMEOUT_MS: process.env.TELEGRAM_WORKER_TIMEOUT_MS,
  TELEGRAM_WORKER_RESOLVE_CHAT_TIMEOUT_MS: process.env.TELEGRAM_WORKER_RESOLVE_CHAT_TIMEOUT_MS,
  FOLLOW_UP_UNANSWERED_HOURS: process.env.FOLLOW_UP_UNANSWERED_HOURS,
  FOLLOW_UP_WARM_LEAD_HOURS: process.env.FOLLOW_UP_WARM_LEAD_HOURS,
  CRM_IGNORED_SWEEP_ENABLED: process.env.CRM_IGNORED_SWEEP_ENABLED,
  CRM_IGNORED_SWEEP_INTERVAL_MINUTES: process.env.CRM_IGNORED_SWEEP_INTERVAL_MINUTES,
  DASHBOARD_ACTIVITY_WINDOW_DAYS: process.env.DASHBOARD_ACTIVITY_WINDOW_DAYS,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL_REPLY: process.env.OPENAI_MODEL_REPLY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  AI_PROMPT_VERSION: process.env.AI_PROMPT_VERSION,
  APP_BASE_URL: process.env.APP_BASE_URL ?? process.env.CORS_ORIGIN ?? "http://localhost:3000",
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO,
  STRIPE_PRICE_TEAM: process.env.STRIPE_PRICE_TEAM,
  EMAIL_FROM: process.env.EMAIL_FROM,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_SECURE: process.env.SMTP_SECURE,
  EMAIL_CODE_SECRET: process.env.EMAIL_CODE_SECRET,
  EMAIL_CODE_TTL_MINUTES: process.env.EMAIL_CODE_TTL_MINUTES,
  EMAIL_CODE_RESEND_COOLDOWN_SECONDS: process.env.EMAIL_CODE_RESEND_COOLDOWN_SECONDS,
  EMAIL_CODE_MAX_ATTEMPTS: process.env.EMAIL_CODE_MAX_ATTEMPTS,
  AI_REQUEST_TIMEOUT_MS: process.env.AI_REQUEST_TIMEOUT_MS,
  AI_MAX_CONTEXT_MESSAGES: process.env.AI_MAX_CONTEXT_MESSAGES,
  REDIS_CACHE_TTL: process.env.REDIS_CACHE_TTL,
  AI_WORKER_CONCURRENCY: process.env.AI_WORKER_CONCURRENCY,
  TELEGRAM_WORKER_CONCURRENCY: process.env.TELEGRAM_WORKER_CONCURRENCY,
  LEADRADAR_MULTI_CHAT_DEDUPE_WINDOW_HOURS: process.env.LEADRADAR_MULTI_CHAT_DEDUPE_WINDOW_HOURS,
  LEADRADAR_MULTI_CHAT_SCORE_BONUS: process.env.LEADRADAR_MULTI_CHAT_SCORE_BONUS,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS
});

if (!parsedEnv.success) {
  console.error("Invalid environment variables", parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsedEnv.data;
export type Env = typeof env;
