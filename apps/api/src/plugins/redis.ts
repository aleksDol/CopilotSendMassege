import fp from "fastify-plugin";
import { Redis } from "ioredis";
import type { FastifyPluginAsync } from "fastify";

const redisPlugin: FastifyPluginAsync = async (app) => {
  const redis = new Redis(app.config.env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false
  });

  redis.on("error", (error) => {
    app.log.error({ err: error }, "Redis connection error");
  });

  app.decorate("redis", redis);

  app.addHook("onClose", async () => {
    await redis.quit();
  });
};

export default fp(redisPlugin, { name: "redis" });
