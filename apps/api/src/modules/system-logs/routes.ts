import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { AppError } from "../../lib/errors.js";
import { ensureInternalToken } from "../../lib/internal-auth.js";
import { isPlatformAdmin } from "../../lib/admin-access.js";
import { getCurrentUserOrThrow } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import { createSystemLogBodySchema, listSystemLogsQuerySchema } from "./schemas.js";
import { listSystemLogs } from "./service.js";

const systemLogsRoutes: FastifyPluginAsync = async (app) => {
  const requirePlatformAdmin = async (request: FastifyRequest) => {
    const currentUser = getCurrentUserOrThrow(request);
    if (!isPlatformAdmin(app.config.env, currentUser.email)) {
      throw new AppError(403, "FORBIDDEN", "Admin access required");
    }
  };

  app.get("/admin/system-logs", { preHandler: [app.authenticate, requirePlatformAdmin] }, async (request) => {
    const query = parseWithSchema(listSystemLogsQuerySchema, request.query);
    return listSystemLogs(app.prisma, query);
  });

  // Internal endpoint so out-of-process workers can persist logs through the
  // shared system log service. Never surfaces DB errors back to the caller.
  app.post("/internal/system-logs", async (request, reply) => {
    ensureInternalToken(
      typeof request.headers["x-internal-token"] === "string" ? request.headers["x-internal-token"] : undefined,
      app.config.env.INTERNAL_API_TOKEN
    );

    const body = parseWithSchema(createSystemLogBodySchema, request.body);

    app.systemLog[body.level]({
      module: body.module,
      event: body.event,
      traceId: body.traceId ?? undefined,
      userId: body.userId ?? undefined,
      companyId: body.companyId ?? undefined,
      metadata: body.metadata ?? undefined
    });

    reply.code(202);
    return { accepted: true };
  });
};

export default systemLogsRoutes;
