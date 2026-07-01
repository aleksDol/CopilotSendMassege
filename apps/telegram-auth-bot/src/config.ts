import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  REDIS_URL: z.string().url(),
  TELEGRAM_AUTH_BOT_TOKEN: z.string().min(1)
});

const parsed = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  REDIS_URL: process.env.REDIS_URL,
  TELEGRAM_AUTH_BOT_TOKEN: process.env.TELEGRAM_AUTH_BOT_TOKEN
});

if (!parsed.success) {
  console.error("Invalid telegram-auth-bot environment", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
