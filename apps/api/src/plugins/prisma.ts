import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["warn", "error", { emit: "event", level: "query" }]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

const prismaPlugin: FastifyPluginAsync = async (app) => {
  app.decorate("prisma", prisma);

  (prisma as { $on: (eventType: string, callback: (event: { duration: number; target: string; query: string }) => void) => void }).$on(
    "query",
    (event) => {
    if (event.duration > 250) {
      app.log.warn(
        {
          durationMs: event.duration,
          target: event.target,
          query: event.query
        },
        "Slow DB query"
      );
    }
    }
  );

  app.addHook("onClose", async () => {
    await app.prisma.$disconnect();
  });
};

export default fp(prismaPlugin, { name: "prisma" });
