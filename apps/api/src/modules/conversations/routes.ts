import type { FastifyPluginAsync } from "fastify";
import { getCompanyScope } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import { listConversationsQuerySchema } from "./schemas.js";
import { listConversations } from "./service.js";

const conversationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/conversations", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const query = parseWithSchema(listConversationsQuerySchema, request.query);

    return listConversations(app, {
      companyId: scope.companyId,
      userId: scope.userId,
      ...query
    });
  });
};

export default conversationRoutes;
