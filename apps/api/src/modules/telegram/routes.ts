import type { FastifyPluginAsync } from "fastify";
import { getCompanyScope } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import {
  telegramConnectStartSchema,
  telegramSyncSchema,
  telegramVerifyCodeSchema,
  telegramVerifyPasswordSchema
} from "./schemas.js";
import {
  getTelegramAccount,
  startConnect,
  triggerInitialSync,
  verifyCode,
  verifyPassword
} from "./service.js";

const telegramRoutes: FastifyPluginAsync = async (app) => {
  app.post("/telegram/connect/start", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(telegramConnectStartSchema, request.body);

    return startConnect(app, scope, body);
  });

  app.post("/telegram/connect/verify-code", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(telegramVerifyCodeSchema, request.body);

    return verifyCode(app, scope, body);
  });

  app.post("/telegram/connect/verify-password", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(telegramVerifyPasswordSchema, request.body);

    return verifyPassword(app, scope, body);
  });

  app.get("/telegram/account", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);

    return getTelegramAccount(app, scope);
  });

  app.post("/telegram/sync", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(telegramSyncSchema, request.body);

    return triggerInitialSync(app, scope, body ?? undefined);
  });
};

export default telegramRoutes;
