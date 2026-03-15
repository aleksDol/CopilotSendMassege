import type { FastifyPluginAsync } from "fastify";
import { getCompanyScope } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import {
  completeTask,
  createTask,
  listConversationTasks,
  listTasks,
  patchTask,
  reopenTask
} from "./service.js";
import {
  conversationTaskParamsSchema,
  createTaskBodySchema,
  listTasksQuerySchema,
  patchTaskBodySchema,
  taskIdParamsSchema
} from "./schemas.js";

const tasksRoutes: FastifyPluginAsync = async (app) => {
  app.get("/tasks", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const query = parseWithSchema(listTasksQuerySchema, request.query);

    return listTasks(app, {
      companyId: scope.companyId,
      ...query
    });
  });

  app.post("/tasks", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(createTaskBodySchema, request.body);

    return createTask(app, {
      companyId: scope.companyId,
      currentUserId: scope.userId,
      ...body
    });
  });

  app.patch("/tasks/:id", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(taskIdParamsSchema, request.params);
    const body = parseWithSchema(patchTaskBodySchema, request.body);

    return patchTask(app, {
      companyId: scope.companyId,
      taskId: params.id,
      ...body
    });
  });

  app.post("/tasks/:id/complete", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(taskIdParamsSchema, request.params);

    return completeTask(app, {
      companyId: scope.companyId,
      taskId: params.id
    });
  });

  app.post("/tasks/:id/reopen", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(taskIdParamsSchema, request.params);

    return reopenTask(app, {
      companyId: scope.companyId,
      taskId: params.id
    });
  });

  app.get("/conversations/:id/tasks", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(conversationTaskParamsSchema, request.params);
    const query = parseWithSchema(listTasksQuerySchema.pick({ limit: true }), request.query);

    return listConversationTasks(app, {
      companyId: scope.companyId,
      conversationId: params.id,
      limit: query.limit
    });
  });
};

export default tasksRoutes;
