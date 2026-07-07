import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { createSystemLogger } from "../lib/system-log.js";

const systemLogPlugin: FastifyPluginAsync = async (app) => {
  app.decorate("systemLog", createSystemLogger(app.log, app.prisma));
};

export default fp(systemLogPlugin, { name: "system-log", dependencies: ["prisma"] });
