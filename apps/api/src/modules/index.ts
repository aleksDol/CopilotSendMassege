import type { FastifyPluginAsync } from "fastify";
import authRoutes from "./auth/routes.js";
import aiRoutes from "./ai/routes.js";
import commentingRoutes from "./commenting/routes.js";
import companyRoutes from "./companies/routes.js";
import conversationRoutes from "./conversations/routes.js";
import dashboardRoutes from "./dashboard/routes.js";
import followUpRoutes from "./follow-up/routes.js";
import healthRoutes from "./health/routes.js";
import ingestionRoutes from "./ingestion/routes.js";
import messageRoutes from "./messages/routes.js";
import realtimeRoutes from "./realtime/routes.js";
import tasksRoutes from "./tasks/routes.js";
import telegramRoutes from "./telegram/routes.js";
import usageRoutes from "./usage/routes.js";
import billingRoutes from "./billing/routes.js";
import teamRoutes from "./team/routes.js";
import userRoutes from "./users/routes.js";
import workspaceRoutes from "./workspace/routes.js";
import settingsRoutes from "./settings/routes.js";
import adminRoutes from "./admin/routes.js";

const apiModules: FastifyPluginAsync = async (app) => {
  await app.register(healthRoutes);
  await app.register(ingestionRoutes);
  await app.register(realtimeRoutes);
  await app.register(followUpRoutes);
  await app.register(authRoutes);
  await app.register(aiRoutes);
  await app.register(commentingRoutes);
  await app.register(telegramRoutes);
  await app.register(conversationRoutes);
  await app.register(messageRoutes);
  await app.register(tasksRoutes);
  await app.register(dashboardRoutes);
  await app.register(usageRoutes);
  await app.register(billingRoutes);
  await app.register(teamRoutes);
  await app.register(workspaceRoutes);
  await app.register(settingsRoutes);
  await app.register(companyRoutes);
  await app.register(userRoutes);
  await app.register(adminRoutes);

  if (app.config.env.ENABLE_LEADRADAR) {
    app.log.info("[LeadRadar] module enabled");
    const { default: leadradarModule } = await import("./leadradar/index.js");
    await app.register(leadradarModule);
  } else {
    app.log.info("[LeadRadar] module disabled");
  }
};

export default apiModules;
