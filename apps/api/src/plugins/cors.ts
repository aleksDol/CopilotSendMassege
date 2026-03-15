import fp from "fastify-plugin";
import cors from "@fastify/cors";
import type { FastifyPluginAsync } from "fastify";

const corsPlugin: FastifyPluginAsync = async (app) => {
  await app.register(cors, {
    origin: app.config.env.CORS_ORIGIN,
    credentials: true
  });
};

export default fp(corsPlugin, { name: "cors" });
