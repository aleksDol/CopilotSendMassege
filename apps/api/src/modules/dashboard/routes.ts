import type { FastifyPluginAsync } from "fastify";
import { getCompanyScope } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import { dashboardOverviewQuerySchema } from "./schemas.js";
import { getDashboardOverview } from "./service.js";

const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get("/dashboard/overview", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const query = parseWithSchema(dashboardOverviewQuerySchema, request.query);

    return getDashboardOverview(app, {
      companyId: scope.companyId,
      windowDays: query.windowDays
    });
  });
};

export default dashboardRoutes;
