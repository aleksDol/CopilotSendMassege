import type { FastifyPluginAsync } from "fastify";
import { getCompanyScope } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import {
  commentCandidateIdParamsSchema,
  listCommentCandidatesQuerySchema,
  updateCommentCandidateBodySchema
} from "./schemas.js";
import {
  getCommentCandidate,
  ignoreCommentCandidate,
  listCommentCandidates,
  publishCommentCandidate,
  updateCommentCandidate
} from "./service.js";

const commentingRoutes: FastifyPluginAsync = async (app) => {
  app.get("/commenting/candidates", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const query = parseWithSchema(listCommentCandidatesQuerySchema, request.query);

    return listCommentCandidates(app, {
      companyId: scope.companyId,
      status: query.status,
      limit: query.limit
    });
  });

  app.get("/commenting/:id", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(commentCandidateIdParamsSchema, request.params);

    return getCommentCandidate(app, {
      companyId: scope.companyId,
      id: params.id
    });
  });

  app.post("/commenting/:id/update", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(commentCandidateIdParamsSchema, request.params);
    const body = parseWithSchema(updateCommentCandidateBodySchema, request.body);

    return updateCommentCandidate(app, {
      companyId: scope.companyId,
      id: params.id,
      aiComment: body.aiComment
    });
  });

  app.post("/commenting/:id/ignore", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(commentCandidateIdParamsSchema, request.params);

    return ignoreCommentCandidate(app, {
      companyId: scope.companyId,
      id: params.id
    });
  });

  app.post("/commenting/:id/publish", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(commentCandidateIdParamsSchema, request.params);

    return publishCommentCandidate(app, {
      companyId: scope.companyId,
      id: params.id
    });
  });
};

export default commentingRoutes;
