import type { FastifyPluginAsync } from "fastify";
import { getCompanyScope } from "../../lib/request-context.js";
import { getCurrentCompany } from "./service.js";

const companyRoutes: FastifyPluginAsync = async (app) => {
  app.get("/company/current", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    return getCurrentCompany(app, scope.companyId);
  });
};

export default companyRoutes;
