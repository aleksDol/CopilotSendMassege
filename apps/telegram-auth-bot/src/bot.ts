import { Bot, InlineKeyboard } from "grammy";
import type { Redis } from "ioredis";
import {
  confirmCallbackPrefix,
  parseLoginSession,
  TELEGRAM_AUTH_LOGIN_TTL_SECONDS,
  telegramAuthLoginKey,
  type TelegramAuthLoginSession
} from "./redis-keys.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const extractLoginToken = (text: string, command: "start" | "login"): string | null => {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) {
    return null;
  }

  const commandName = parts[0].replace(/^\//, "").split("@")[0];
  if (commandName !== command) {
    return null;
  }

  const token = parts[1]?.trim();
  if (!token || !UUID_PATTERN.test(token)) {
    return null;
  }

  return token;
};

const buildConfirmKeyboard = (loginToken: string) =>
  new InlineKeyboard().text("Подтвердить вход", `${confirmCallbackPrefix}${loginToken}`);

export const createTelegramAuthBot = (token: string, redis: Redis) => {
  const bot = new Bot(token);

  const showLoginPrompt = async (chatId: number, loginToken: string) => {
    const raw = await redis.get(telegramAuthLoginKey(loginToken));
    const session = parseLoginSession(raw);

    if (!session) {
      await bot.api.sendMessage(chatId, "Ссылка для входа устарела или недействительна. Вернитесь на сайт и начните вход заново.");
      return;
    }

    if (session.status === "confirmed") {
      await bot.api.sendMessage(chatId, "Вход уже подтверждён. Вернитесь на сайт.");
      return;
    }

    await bot.api.sendMessage(
      chatId,
      "Подтвердите вход в AI Sales Assistant.\n\nЕсли вы не запрашивали вход, просто проигнорируйте это сообщение.",
      {
        reply_markup: buildConfirmKeyboard(loginToken)
      }
    );
  };

  bot.command("start", async (ctx) => {
    const loginToken = extractLoginToken(ctx.message?.text ?? "", "start");
    if (!loginToken || !ctx.chat) {
      await ctx.reply("Этот бот используется только для входа в AI Sales Assistant через сайт.");
      return;
    }

    await showLoginPrompt(ctx.chat.id, loginToken);
  });

  bot.command("login", async (ctx) => {
    const loginToken = extractLoginToken(ctx.message?.text ?? "", "login");
    if (!loginToken || !ctx.chat) {
      await ctx.reply("Использование: /login <код_входа>");
      return;
    }

    await showLoginPrompt(ctx.chat.id, loginToken);
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!data?.startsWith(confirmCallbackPrefix)) {
      await ctx.answerCallbackQuery();
      return;
    }

    const loginToken = data.slice(confirmCallbackPrefix.length);
    if (!UUID_PATTERN.test(loginToken)) {
      await ctx.answerCallbackQuery({ text: "Недействительный запрос", show_alert: true });
      return;
    }

    const key = telegramAuthLoginKey(loginToken);
    const raw = await redis.get(key);
    const session = parseLoginSession(raw);

    if (!session) {
      await ctx.answerCallbackQuery({ text: "Сессия входа истекла", show_alert: true });
      return;
    }

    if (session.status === "confirmed") {
      await ctx.answerCallbackQuery({ text: "Вход уже подтверждён" });
      return;
    }

    const from = ctx.from;
    if (!from) {
      await ctx.answerCallbackQuery({ text: "Не удалось определить пользователя", show_alert: true });
      return;
    }

    const confirmed: TelegramAuthLoginSession = {
      status: "confirmed",
      telegramUserId: String(from.id),
      username: from.username ?? null,
      firstName: from.first_name ?? null,
      lastName: from.last_name ?? null,
      photoUrl: null,
      confirmedAt: new Date().toISOString()
    };

    await redis.set(key, JSON.stringify(confirmed), "EX", TELEGRAM_AUTH_LOGIN_TTL_SECONDS);

    await ctx.answerCallbackQuery({ text: "Вход подтверждён" });
    await ctx.editMessageText("Вход подтверждён. Вернитесь на сайт — окно входа обновится автоматически.");
  });

  return bot;
};
