import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { AppError } from "../../lib/errors.js";
import { isPlatformAdmin } from "../../lib/admin-access.js";
import { getCurrentUserOrThrow } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import { adminUsersQuerySchema, updateSubscriptionBodySchema } from "./schemas.js";
import { listAdminUsers, updateSubscriptionForUser } from "./service.js";

const adminRoutes: FastifyPluginAsync = async (app) => {
  const requirePlatformAdmin = async (request: FastifyRequest) => {
    const currentUser = getCurrentUserOrThrow(request);

    if (!isPlatformAdmin(app.config.env, currentUser.email)) {
      throw new AppError(403, "FORBIDDEN", "Admin access required");
    }
  };

  app.get("/admin/users", { preHandler: [app.authenticate, requirePlatformAdmin] }, async (request) => {
    const raw = request.query as Record<string, string | undefined>;
    const query = parseWithSchema(adminUsersQuerySchema, {
      search: raw.search,
      filter: raw.filter
    });

    const users = await listAdminUsers(app, query);

    return { users };
  });

  app.post("/admin/users/:id/update-subscription", { preHandler: [app.authenticate, requirePlatformAdmin] }, async (request) => {
    const params = request.params as { id: string };
    const body = parseWithSchema(updateSubscriptionBodySchema, request.body);

    return updateSubscriptionForUser(app, params.id, body);
  });
};

export default adminRoutes;
