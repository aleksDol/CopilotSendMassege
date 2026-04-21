import type { FastifyPluginAsync } from "fastify";
import { getCompanyScope } from "../../lib/request-context.js";
import { ensureInternalToken } from "../../lib/internal-auth.js";
import { parseWithSchema } from "../../lib/validation.js";
import {
  channelIdParamSchema,
  commentCandidateIdParamsSchema,
  internalCommentCandidateIdParamsSchema,
  addChannelExclusionBodySchema,
  listCommentCandidatesQuerySchema,
  setAutoCommentingBodySchema,
  upsertCommentingStateBodySchema,
  updateCommentCandidateBodySchema
} from "./schemas.js";
import {
  addChannelExclusion,
  getCommentCandidate,
  getCommentingState,
  getCommentingStats,
  ignoreCommentCandidate,
  listCommentCandidates,
  publishCommentCandidate,
  publishCommentCandidateInternal,
  removeChannelExclusion,
  setAutoCommentingEnabled,
  upsertCommentingState,
  updateCommentCandidate
} from "./service.js";

const commentingRoutes: FastifyPluginAsync = async (app) => {
  app.get("/commenting/candidates", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const query = parseWithSchema(listCommentCandidatesQuerySchema, request.query);

    return listCommentCandidates(app, {
      companyId: scope.companyId,
      userId: scope.userId,
      status: query.status,
      limit: query.limit,
      onlyNew: query.onlyNew
    });
  });

  app.get("/commenting/state", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    return getCommentingState(app, { userId: scope.userId });
  });

  app.post("/commenting/auto", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(setAutoCommentingBodySchema, request.body);
    return setAutoCommentingEnabled(app, { userId: scope.userId, enabled: body.enabled });
  });

  app.get("/commenting/stats", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    return getCommentingStats(app, { companyId: scope.companyId, userId: scope.userId });
  });

  app.post("/commenting/state", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(upsertCommentingStateBodySchema, request.body);
    return upsertCommentingState(app, { userId: scope.userId, lastSeenAt: body.lastSeenAt });
  });

  app.get("/commenting/exclusions", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    return getCommentingState(app, { userId: scope.userId });
  });

  app.post("/commenting/exclusions", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(addChannelExclusionBodySchema, request.body);
    return addChannelExclusion(app, { userId: scope.userId, channelId: body.channelId });
  });

  app.delete("/commenting/exclusions/:channelId", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(channelIdParamSchema, request.params);
    return removeChannelExclusion(app, { userId: scope.userId, channelId: params.channelId });
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
      id: params.id,
      source: "manual"
    });
  });

  app.post("/internal/commenting/candidates/:id/publish-auto", async (request) => {
    ensureInternalToken(
      typeof request.headers["x-internal-token"] === "string" ? request.headers["x-internal-token"] : undefined,
      app.config.env.INTERNAL_API_TOKEN
    );
    const params = parseWithSchema(internalCommentCandidateIdParamsSchema, request.params);
    return publishCommentCandidateInternal(app, { id: params.id, source: "auto" });
  });
};

export default commentingRoutes;
