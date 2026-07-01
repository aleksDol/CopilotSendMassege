import { Redis } from "ioredis";
import { env } from "./config.js";
import { createTelegramAuthBot } from "./bot.js";

const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true
});

redis.on("error", (error) => {
  console.error("[telegram-auth-bot] redis error", error);
});

const bot = createTelegramAuthBot(env.TELEGRAM_AUTH_BOT_TOKEN, redis);

bot.catch((error) => {
  console.error("[telegram-auth-bot] handler error", error);
});

const shutdown = async () => {
  await bot.stop();
  await redis.quit();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

console.log("[telegram-auth-bot] starting long polling");
await bot.start();
