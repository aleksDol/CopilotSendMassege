import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { Prisma } from "@prisma/client";
import { isAppError } from "../lib/errors.js";

const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: "Route not found"
      }
    });
  });

  app.setErrorHandler((error, _request, reply) => {
    if (isAppError(error)) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return reply.status(409).send({
        error: {
          code: "CONFLICT",
          message: "Resource already exists"
        }
      });
    }

    app.log.error(error);

    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error"
      }
    });
  });
};

export default fp(errorHandlerPlugin, { name: "error-handler" });
