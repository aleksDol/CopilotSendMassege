import type { FastifyInstance } from "fastify";

const toCacheKey = (parts: Array<string | number | boolean | null | undefined>) =>
  parts
    .filter((part) => part !== undefined && part !== null)
    .map((part) => String(part))
    .join(":");

export const readThroughCache = async <T>(
  app: FastifyInstance,
  params: {
    keyParts: Array<string | number | boolean | null | undefined>;
    ttlSeconds?: number;
    loader: () => Promise<T>;
  }
): Promise<T> => {
  const key = toCacheKey(params.keyParts);
  const ttl = params.ttlSeconds ?? app.config.env.REDIS_CACHE_TTL;

  try {
    const cached = await app.redis.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch (error) {
    app.log.warn({ err: error, key }, "Redis cache read failed");
  }

  const value = await params.loader();

  try {
    await app.redis.set(key, JSON.stringify(value), "EX", ttl);
  } catch (error) {
    app.log.warn({ err: error, key }, "Redis cache write failed");
  }

  return value;
};

export const invalidateCacheByPrefix = async (app: FastifyInstance, prefix: string) => {
  try {
    const keys = await app.redis.keys(`${prefix}*`);
    if (keys.length > 0) {
      await app.redis.del(...keys);
    }
  } catch (error) {
    app.log.warn({ err: error, prefix }, "Redis cache invalidation failed");
  }
};
