import type { FastifyPluginAsync } from "fastify";
import { getCompanyScope } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import { WorkspaceService } from "./service.js";
import { patchWorkspaceSchema } from "./schemas.js";

const workspaceRoutes: FastifyPluginAsync = async (app) => {
  const service = new WorkspaceService(app);

  app.get("/workspace/settings", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    return service.getSettings(scope.companyId);
  });

  app.patch("/workspace/settings", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(patchWorkspaceSchema, request.body);
    return service.patchSettings(scope.companyId, body);
  });
};

export default workspaceRoutes;
