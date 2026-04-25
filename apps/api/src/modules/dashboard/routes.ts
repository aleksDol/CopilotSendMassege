import type { FastifyPluginAsync } from "fastify";
import { getCompanyScope, getCurrentUserOrThrow } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import { dashboardOverviewQuerySchema, dashboardSalesQuerySchema } from "./schemas.js";
import { getDashboardOverview, getDashboardSales } from "./service.js";

const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get("/dashboard/overview", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const query = parseWithSchema(dashboardOverviewQuerySchema, request.query);

    return getDashboardOverview(app, {
      companyId: scope.companyId,
      userId: scope.userId,
      windowDays: query.windowDays
    });
  });

  app.get("/dashboard/sales", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const user = getCurrentUserOrThrow(request);
    const query = parseWithSchema(dashboardSalesQuerySchema, request.query);

    return getDashboardSales(app, {
      companyId: scope.companyId,
      userId: scope.userId,
      period: query.period,
      timezone: user.company.timezone
    });
  });
};

export default dashboardRoutes;
