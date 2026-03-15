import type { FastifyPluginAsync } from "fastify";
import { ensureInternalToken } from "../../lib/internal-auth.js";
import { parseWithSchema } from "../../lib/validation.js";
import { runFollowUpBodySchema } from "./schemas.js";
import { scanAndCreateFollowUps } from "./service.js";

const followUpRoutes: FastifyPluginAsync = async (app) => {
  app.post("/internal/follow-up/run", async (request) => {
    ensureInternalToken(
      typeof request.headers["x-internal-token"] === "string" ? request.headers["x-internal-token"] : undefined,
      app.config.env.INTERNAL_API_TOKEN
    );

    const body = parseWithSchema(runFollowUpBodySchema, request.body);

    return scanAndCreateFollowUps(app, {
      companyId: body?.companyId,
      dryRun: body?.dryRun
    });
  });
};

export default followUpRoutes;
