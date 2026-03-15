import type { FastifyPluginAsync } from "fastify";
import { getCompanyScope } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import { listConversationMessages, sendConversationMessage } from "./service.js";
import { conversationParamsSchema, listMessagesQuerySchema, sendMessageBodySchema } from "./schemas.js";

const messageRoutes: FastifyPluginAsync = async (app) => {
  app.get("/conversations/:id/messages", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(conversationParamsSchema, request.params);
    const query = parseWithSchema(listMessagesQuerySchema, request.query);

    return listConversationMessages(app, {
      companyId: scope.companyId,
      conversationId: params.id,
      ...query
    });
  });

  app.post("/conversations/:id/messages", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(conversationParamsSchema, request.params);
    const body = parseWithSchema(sendMessageBodySchema, request.body);

    return sendConversationMessage(app, {
      companyId: scope.companyId,
      userId: scope.userId,
      conversationId: params.id,
      text: body.text
    });
  });
};

export default messageRoutes;
