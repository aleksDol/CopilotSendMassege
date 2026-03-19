import type { FastifyPluginAsync } from "fastify";
import { getCompanyScope } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import {
  createKnowledgeBodySchema,
  knowledgeIdParamsSchema,
  patchKnowledgeBodySchema,
  saveReplyPolicySchema
} from "./schemas.js";
import { SettingsService } from "./service.js";

const settingsRoutes: FastifyPluginAsync = async (app) => {
  const service = new SettingsService(app);

  app.get("/settings/knowledge", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    return service.listKnowledge(scope.companyId);
  });

  app.post("/settings/knowledge", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(createKnowledgeBodySchema, request.body);
    return service.createKnowledge(scope.companyId, scope.userId, body);
  });

  app.patch("/settings/knowledge/:id", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(knowledgeIdParamsSchema, request.params);
    const body = parseWithSchema(patchKnowledgeBodySchema, request.body);
    return service.patchKnowledge(scope.companyId, params.id, body);
  });

  app.get("/settings/reply-policy", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    return service.getReplyPolicy(scope.companyId);
  });

  app.post("/settings/reply-policy", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(saveReplyPolicySchema, request.body);
    return service.saveReplyPolicy(scope.companyId, body);
  });
};

export default settingsRoutes;
