import type { FastifyPluginAsync } from "fastify";
import { getCurrentUserOrThrow } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import { getCurrentUserProfile, updateCurrentUser } from "./service.js";
import { updateCurrentUserSchema } from "./schemas.js";

const userRoutes: FastifyPluginAsync = async (app) => {
  app.get("/users/me", { preHandler: [app.authenticate] }, async (request) => {
    const currentUser = getCurrentUserOrThrow(request);
    return getCurrentUserProfile(app, currentUser.id);
  });

  app.patch("/users/me", { preHandler: [app.authenticate] }, async (request) => {
    const currentUser = getCurrentUserOrThrow(request);
    const body = parseWithSchema(updateCurrentUserSchema, request.body);

    return updateCurrentUser(app, currentUser.id, body);
  });
};

export default userRoutes;
