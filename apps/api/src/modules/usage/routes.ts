import type { FastifyPluginAsync } from "fastify";
import { getCompanyScope } from "../../lib/request-context.js";
import { UsageMetricsService } from "./service.js";

const usageRoutes: FastifyPluginAsync = async (app) => {
  const service = new UsageMetricsService(app);

  app.get("/usage/overview", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    return service.getOverview(scope.companyId);
  });
};

export default usageRoutes;
