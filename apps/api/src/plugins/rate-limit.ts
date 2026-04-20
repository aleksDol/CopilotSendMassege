import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";

const rateLimitPlugin: FastifyPluginAsync = async (app) => {
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    redis: app.redis,
    // If Redis is down, we prefer to fail closed (protect APIs from abuse).
    skipOnError: false,
    // Internal server-to-server endpoints must not be rate-limited:
    // - They are only reachable inside the docker network and are authenticated
    //   via the x-internal-token header (see ensureInternalToken).
    // - telegram-worker's live listener bursts dozens of /internal/telegram/events/message
    //   per second during busy chats; a 300/min global cap silently drops messages,
    //   which breaks LeadRadar + conversation ingestion (events never reach the DB).
    // Public APIs (/auth, /telegram, /ai, ...) keep the global 300/min behavior.
    allowList: (req: FastifyRequest) => {
      const url = req.url || "";
      return url.startsWith("/internal/");
    }
  });
};

export default fp(rateLimitPlugin, { name: "rate-limit", dependencies: ["redis"] });

