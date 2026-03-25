import fp from "fastify-plugin";
import helmet from "@fastify/helmet";
import type { FastifyPluginAsync } from "fastify";

const helmetPlugin: FastifyPluginAsync = async (app) => {
  await app.register(helmet, {
    // Keep CSP disabled here because:
    // - The web app is served by Next.js (separate service) and may require inline scripts for analytics.
    // - Nginx already sets baseline headers in production.
    // We still enable the rest of helmet protections for direct API exposure.
    contentSecurityPolicy: false
  });
};

export default fp(helmetPlugin, { name: "helmet" });

