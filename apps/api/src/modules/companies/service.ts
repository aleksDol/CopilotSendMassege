import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { toPublicCompany } from "../../lib/mappers.js";

export const getCurrentCompany = async (app: FastifyInstance, companyId: string) => {
  const company = await app.prisma.company.findUnique({ where: { id: companyId } });

  if (!company) {
    throw new AppError(404, "COMPANY_NOT_FOUND", "Company not found");
  }

  return {
    company: toPublicCompany(company)
  };
};
