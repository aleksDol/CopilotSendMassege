import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import type { FastifyPluginAsync } from "fastify";

const rateLimitPlugin: FastifyPluginAsync = async (app) => {
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    redis: app.redis,
    // If Redis is down, we prefer to fail closed (protect APIs from abuse).
    skipOnError: false
  });

  // Rate limit unknown URLs to slow down endpoint probing.
  app.setNotFoundHandler(
    {
      preHandler: app.rateLimit({
        max: 30,
        timeWindow: "1 minute"
      })
    },
    async (_request, reply) => {
      reply.code(404).send({ error: "NOT_FOUND" });
    }
  );
};

export default fp(rateLimitPlugin, { name: "rate-limit", dependencies: ["redis"] });

