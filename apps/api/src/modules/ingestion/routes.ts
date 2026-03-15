import type { FastifyPluginAsync } from "fastify";
import { ensureInternalToken } from "../../lib/internal-auth.js";
import { parseWithSchema } from "../../lib/validation.js";
import { ingestionMessageSchema } from "./schemas.js";
import { ingestMessageEvent } from "./service.js";

const ingestionRoutes: FastifyPluginAsync = async (app) => {
  app.post("/internal/telegram/events/message", async (request) => {
    ensureInternalToken(
      typeof request.headers["x-internal-token"] === "string" ? request.headers["x-internal-token"] : undefined,
      app.config.env.INTERNAL_API_TOKEN
    );

    const body = parseWithSchema(ingestionMessageSchema, request.body);
    return ingestMessageEvent(app, body);
  });
};

export default ingestionRoutes;
