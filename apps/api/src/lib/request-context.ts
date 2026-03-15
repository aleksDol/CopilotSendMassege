import type { FastifyRequest } from "fastify";
import { AppError } from "./errors.js";

export const getCurrentUserOrThrow = (request: FastifyRequest) => {
  if (!request.currentUser) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  return request.currentUser;
};

export const getCompanyScope = (request: FastifyRequest) => {
  const user = getCurrentUserOrThrow(request);

  return {
    userId: user.id,
    companyId: user.companyId
  };
};
