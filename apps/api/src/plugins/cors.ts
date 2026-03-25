import fp from "fastify-plugin";
import cors from "@fastify/cors";
import type { FastifyPluginAsync } from "fastify";

const corsPlugin: FastifyPluginAsync = async (app) => {
  await app.register(cors, {
    origin: app.config.env.CORS_ORIGIN,
    // We use Authorization: Bearer tokens (no cookies), so credentials are not needed.
    // Keeping it enabled increases CSRF risk surface if cookies are introduced later.
    credentials: false
  });
};

export default fp(corsPlugin, { name: "cors" });
