import type { FastifyPluginAsync } from "fastify";
import { getCompanyScope } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import {
  telegramConnectStartSchema,
  telegramAccountQuerySchema,
  telegramAccountIdParamsSchema,
  patchTelegramAccountBodySchema,
  telegramPollQrSchema,
  telegramSyncSchema,
  telegramVerifyCodeSchema,
  telegramVerifyPasswordQrSchema,
  telegramVerifyPasswordSchema
} from "./schemas.js";
import {
  getTelegramAccount,
  listTelegramAccounts,
  disconnectTelegram,
  pollLoginQr,
  startConnect,
  startConnectQr,
  triggerInitialSync,
  verifyCode,
  verifyPassword,
  verifyPasswordQr,
  patchTelegramAccountFlags
} from "./service.js";

const telegramRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/telegram/connect/start-qr",
    {
      preHandler: [
        app.authenticate,
        app.rateLimit({
          groupId: "telegram:connect",
          max: 20,
          timeWindow: "1 minute",
          keyGenerator: (request) => request.currentUser?.id ?? request.ip
        })
      ]
    },
    async (request) => {
    const scope = getCompanyScope(request);
    return startConnectQr(app, scope);
    }
  );

  app.post(
    "/telegram/connect/poll-qr",
    {
      preHandler: [
        app.authenticate,
        app.rateLimit({
          groupId: "telegram:connect",
          max: 120,
          timeWindow: "1 minute",
          keyGenerator: (request) => request.currentUser?.id ?? request.ip
        })
      ]
    },
    async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(telegramPollQrSchema, request.body);
    return pollLoginQr(app, scope, body);
    }
  );

  app.post(
    "/telegram/connect/verify-password-qr",
    {
      preHandler: [
        app.authenticate,
        app.rateLimit({
          groupId: "telegram:connect",
          max: 20,
          timeWindow: "1 minute",
          keyGenerator: (request) => request.currentUser?.id ?? request.ip
        })
      ]
    },
    async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(telegramVerifyPasswordQrSchema, request.body);
    return verifyPasswordQr(app, scope, body);
    }
  );

  app.post(
    "/telegram/connect/start",
    {
      preHandler: [
        app.authenticate,
        app.rateLimit({
          groupId: "telegram:connect",
          max: 10,
          timeWindow: "1 minute",
          keyGenerator: (request) => request.currentUser?.id ?? request.ip
        })
      ]
    },
    async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(telegramConnectStartSchema, request.body);

    return startConnect(app, scope, body);
    }
  );

  app.post(
    "/telegram/connect/verify-code",
    {
      preHandler: [
        app.authenticate,
        app.rateLimit({
          groupId: "telegram:connect",
          max: 15,
          timeWindow: "1 minute",
          keyGenerator: (request) => request.currentUser?.id ?? request.ip
        })
      ]
    },
    async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(telegramVerifyCodeSchema, request.body);

    return verifyCode(app, scope, body);
    }
  );

  app.post(
    "/telegram/connect/verify-password",
    {
      preHandler: [
        app.authenticate,
        app.rateLimit({
          groupId: "telegram:connect",
          max: 10,
          timeWindow: "1 minute",
          keyGenerator: (request) => request.currentUser?.id ?? request.ip
        })
      ]
    },
    async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(telegramVerifyPasswordSchema, request.body);

    return verifyPassword(app, scope, body);
    }
  );

  app.get("/telegram/account", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const query = parseWithSchema(telegramAccountQuerySchema, request.query);

    return getTelegramAccount(app, scope, query);
  });

  app.get("/telegram/accounts", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    return listTelegramAccounts(app, scope);
  });

  app.patch("/telegram/account/:id", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(telegramAccountIdParamsSchema, request.params);
    const body = parseWithSchema(patchTelegramAccountBodySchema, request.body);
    return patchTelegramAccountFlags(app, scope, {
      channelAccountId: params.id,
      sendingEnabled: body.sendingEnabled,
      parsingEnabled: body.parsingEnabled
    });
  });

  app.post(
    "/telegram/sync",
    {
      preHandler: [
        app.authenticate,
        app.rateLimit({
          groupId: "telegram:sync",
          max: 3,
          timeWindow: "1 minute",
          keyGenerator: (request) => request.currentUser?.id ?? request.ip
        })
      ]
    },
    async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(telegramSyncSchema, request.body);

    return triggerInitialSync(app, scope, body ?? undefined);
    }
  );

  app.post("/telegram/logout", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    return disconnectTelegram(app, scope);
  });
};

export default telegramRoutes;
