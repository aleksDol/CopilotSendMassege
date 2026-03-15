import fp from "fastify-plugin";
import rawBody from "fastify-raw-body";
import type { FastifyPluginAsync } from "fastify";

const rawBodyPlugin: FastifyPluginAsync = async (app) => {
  await app.register(rawBody, {
    field: "rawBody",
    global: false,
    runFirst: true,
    encoding: false
  });
};

export default fp(rawBodyPlugin, { name: "raw-body" });
