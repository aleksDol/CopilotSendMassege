import type { FastifyPluginAsync } from "fastify";
import { getCurrentUserOrThrow } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import { telegramAuthCompleteBodySchema, telegramAuthRegisterBodySchema } from "./schemas.js";
import { completeTelegramLogin, getTelegramIdentityForUser, registerTelegramUser, startTelegramLogin } from "./service.js";

const telegramAuthRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/auth/telegram/start",
    {
      preHandler: [
        app.rateLimit({
          groupId: "auth:telegram",
          max: 20,
          timeWindow: "10 minutes",
          keyGenerator: (request) => request.ip
        })
      ]
    },
    async () => startTelegramLogin(app)
  );

  app.post(
    "/auth/telegram/complete",
    {
      preHandler: [
        app.rateLimit({
          groupId: "auth:telegram",
          max: 120,
          timeWindow: "10 minutes",
          keyGenerator: (request) => request.ip
        })
      ]
    },
    async (request) => {
      const body = parseWithSchema(telegramAuthCompleteBodySchema, request.body);
      return completeTelegramLogin(app, body);
    }
  );

  app.post(
    "/auth/telegram/register",
    {
      preHandler: [
        app.rateLimit({
          groupId: "auth:telegram",
          max: 20,
          timeWindow: "10 minutes",
          keyGenerator: (request) => request.ip
        })
      ]
    },
    async (request) => {
      const body = parseWithSchema(telegramAuthRegisterBodySchema, request.body);
      return registerTelegramUser(app, body);
    }
  );

  app.get("/auth/telegram/me", { preHandler: [app.authenticate] }, async (request) => {
    const currentUser = getCurrentUserOrThrow(request);
    return getTelegramIdentityForUser(app, currentUser.id);
  });
};

export default telegramAuthRoutes;
