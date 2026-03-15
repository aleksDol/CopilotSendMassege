import type { FastifyPluginAsync } from "fastify";
import { getCompanyScope } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import { TeamService } from "./service.js";
import { acceptInviteBodySchema, inviteMemberBodySchema, removeMemberParamsSchema } from "./schemas.js";

const teamRoutes: FastifyPluginAsync = async (app) => {
  const service = new TeamService(app);

  app.get("/team", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    return service.listMembers(scope.companyId);
  });

  app.post("/team/invite", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(inviteMemberBodySchema, request.body);

    return service.inviteMember({
      companyId: scope.companyId,
      invitedByUserId: scope.userId,
      email: body.email,
      role: body.role
    });
  });

  app.delete("/team/member/:id", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(removeMemberParamsSchema, request.params);

    return service.removeMember({
      companyId: scope.companyId,
      actorUserId: scope.userId,
      memberId: params.id
    });
  });

  app.post("/team/invite/accept", async (request) => {
    const body = parseWithSchema(acceptInviteBodySchema, request.body);
    return service.acceptInvite(body);
  });
};

export default teamRoutes;
