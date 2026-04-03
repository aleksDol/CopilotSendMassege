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

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return reply.status(409).send({
          error: {
            code: "CONFLICT",
            message: "Resource already exists"
          }
        });
      }
      if (error.code === "P2003") {
        return reply.status(409).send({
          error: {
            code: "FK_CONSTRAINT",
            message: "Cannot delete: related records exist",
            details: error.meta
          }
        });
      }
      if (error.code === "P2025") {
        return reply.status(404).send({
          error: {
            code: "NOT_FOUND",
            message: "Record not found or already deleted"
          }
        });
      }
    }

    app.log.error(error);

    const errName = error instanceof Error ? error.constructor.name : "UnknownError";
    const prismaCode = (error as { code?: string })?.code;
    const safeMessage = error instanceof Error ? error.message : "Internal server error";

    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: safeMessage,
        errorType: errName,
        ...(prismaCode ? { prismaCode } : {})
      }
    });
  });
};

export default fp(errorHandlerPlugin, { name: "error-handler" });
