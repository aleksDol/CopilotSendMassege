import Fastify from "fastify";
import type { AppConfig } from "./config/index.js";
import prismaPlugin from "./plugins/prisma.js";
import redisPlugin from "./plugins/redis.js";
import systemLogPlugin from "./plugins/system-log.js";
import rawBodyPlugin from "./plugins/raw-body.js";
import corsPlugin from "./plugins/cors.js";
import authPlugin from "./plugins/auth.js";
import rateLimitPlugin from "./plugins/rate-limit.js";
import helmetPlugin from "./plugins/helmet.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import apiModules from "./modules/index.js";
import { startIgnoredLeadSweep } from "./modules/follow-up/ignored-lead-sweep-runner.js";

export const buildApp = async (config: AppConfig) => {
  const app = Fastify({
    logger: {
      level: config.env.NODE_ENV === "production" ? "info" : "debug",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.x-internal-token",
          "headers.authorization",
          "headers.x-internal-token"
        ],
        remove: true
      }
    },
    requestIdHeader: "x-request-id"
  });

  app.decorate("config", config);

  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(systemLogPlugin);
  await app.register(rawBodyPlugin);
  await app.register(corsPlugin);
  await app.register(helmetPlugin);
  await app.register(authPlugin);
  await app.register(rateLimitPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(apiModules);

  // Background sweeps (safe, env-gated).
  startIgnoredLeadSweep(app);

  return app;
};
