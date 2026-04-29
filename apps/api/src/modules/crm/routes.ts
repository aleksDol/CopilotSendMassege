import type { FastifyPluginAsync } from "fastify";
import { getCompanyScope } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import { listCrmLeadsQuerySchema } from "./schemas.js";
import { listCrmLeads } from "./service.js";

const crmRoutes: FastifyPluginAsync = async (app) => {
  app.get("/crm/leads", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const query = parseWithSchema(listCrmLeadsQuerySchema, request.query);

    return listCrmLeads(app, {
      companyId: scope.companyId,
      limit: query.limit,
      cursor: query.cursor,
      stage: query.stage,
      search: query.search,
      channelAccountId: query.channelAccountId
    });
  });
};

export default crmRoutes;

