import type { FastifyPluginAsync } from "fastify";
import { getCurrentUserOrThrow } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import { loginBodySchema, registerBodySchema } from "./schemas.js";
import { getMe, loginUser, registerUser } from "./service.js";

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/register", async (request) => {
    const body = parseWithSchema(registerBodySchema, request.body);

    return registerUser(app, body);
  });

  app.post("/auth/login", async (request) => {
    const body = parseWithSchema(loginBodySchema, request.body);

    return loginUser(app, body);
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (request) => {
    const currentUser = getCurrentUserOrThrow(request);
    return getMe(app, currentUser.id);
  });
};

export default authRoutes;
