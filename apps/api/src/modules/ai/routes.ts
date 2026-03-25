import type { FastifyPluginAsync } from "fastify";
import { getCompanyScope } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import {
  listSuggestionsParamsSchema,
  listSuggestionsQuerySchema,
  suggestReplyBodySchema,
  suggestReplyParamsSchema,
  suggestionActionParamsSchema
} from "./schemas.js";
import { ReplySuggestionService } from "./reply-suggestion-service.js";

const aiRoutes: FastifyPluginAsync = async (app) => {
  const service = new ReplySuggestionService(app);

  app.post(
    "/conversations/:id/ai/suggest-reply",
    {
      preHandler: [
        app.authenticate,
        app.rateLimit({
          groupId: "ai:suggest-reply",
          max: 30,
          timeWindow: "1 minute",
          keyGenerator: (request) => request.currentUser?.id ?? request.ip
        })
      ]
    },
    async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(suggestReplyParamsSchema, request.params);
    const body = parseWithSchema(suggestReplyBodySchema, request.body);

    return service.suggestReply({
      companyId: scope.companyId,
      userId: scope.userId,
      conversationId: params.id,
      mode: body.mode
    });
    }
  );

  app.get("/conversations/:id/ai/suggestions", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(listSuggestionsParamsSchema, request.params);
    const query = parseWithSchema(listSuggestionsQuerySchema, request.query);

    return service.listSuggestions({
      companyId: scope.companyId,
      conversationId: params.id,
      limit: query.limit
    });
  });

  app.post("/ai/suggestions/:id/accept", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(suggestionActionParamsSchema, request.params);

    return service.acceptSuggestion({
      companyId: scope.companyId,
      suggestionId: params.id
    });
  });

  app.post("/ai/suggestions/:id/reject", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(suggestionActionParamsSchema, request.params);

    return service.rejectSuggestion({
      companyId: scope.companyId,
      suggestionId: params.id
    });
  });
};

export default aiRoutes;
