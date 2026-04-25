import type { FastifyPluginAsync } from "fastify";
import { getCompanyScope } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import {
  conversationIdParamsSchema,
  listConversationsQuerySchema,
  updateConversationLeadStageBodySchema
} from "./schemas.js";
import { listConversations } from "./service.js";
import { updateConversationLeadStage } from "./lead-stage-update-service.js";

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

  app.patch("/conversations/:conversationId/lead-stage", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(conversationIdParamsSchema, request.params);
    const body = parseWithSchema(updateConversationLeadStageBodySchema, request.body);

    return updateConversationLeadStage(app.prisma, {
      companyId: scope.companyId,
      conversationId: params.conversationId,
      stage: body.stage
    });
  });
};

export default conversationRoutes;
