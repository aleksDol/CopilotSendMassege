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
};

export default fp(rateLimitPlugin, { name: "rate-limit", dependencies: ["redis"] });

