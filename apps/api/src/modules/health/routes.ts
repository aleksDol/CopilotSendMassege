import os from "node:os";
import process from "node:process";
import type { FastifyPluginAsync } from "fastify";

const healthRoutes: FastifyPluginAsync = async (app) => {
  const startedAt = Date.now();

  app.get("/health", async () => ({ ok: true }));

  app.get("/health/ready", async () => {
    await app.prisma.$queryRaw`SELECT 1`;

    return {
      ok: true,
      checks: {
        database: "up"
      }
    };
  });

  app.get("/metrics", async (_request, reply) => {
    const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
    const memoryUsage = process.memoryUsage();

    reply.header("content-type", "text/plain; version=0.0.4; charset=utf-8");

    return [
      "# HELP api_uptime_seconds API uptime in seconds",
      "# TYPE api_uptime_seconds gauge",
      `api_uptime_seconds ${uptimeSeconds}`,
      "# HELP api_process_resident_memory_bytes Resident memory bytes",
      "# TYPE api_process_resident_memory_bytes gauge",
      `api_process_resident_memory_bytes ${memoryUsage.rss}`,
      "# HELP api_nodejs_heap_used_bytes Node.js heap used",
      "# TYPE api_nodejs_heap_used_bytes gauge",
      `api_nodejs_heap_used_bytes ${memoryUsage.heapUsed}`,
      "# HELP api_system_load_average_1m System load average (1m)",
      "# TYPE api_system_load_average_1m gauge",
      `api_system_load_average_1m ${os.loadavg()[0] ?? 0}`
    ].join("\n");
  });
};

export default healthRoutes;
