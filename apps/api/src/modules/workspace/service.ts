import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";

export class WorkspaceService {
  constructor(private readonly app: FastifyInstance) {}

  async getSettings(companyId: string) {
    const company = await this.app.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        plan: true,
        defaultReplyPolicy: true
      }
    });

    if (!company) {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Company not found");
    }

    return {
      workspace: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        timezone: company.timezone,
        plan: company.plan.toLowerCase(),
        defaultReplyPolicy: company.defaultReplyPolicy
      }
    };
  }

  async patchSettings(
    companyId: string,
    payload: { name?: string; timezone?: string; defaultReplyPolicy?: Record<string, unknown> | null }
  ) {
    const defaultReplyPolicy =
      payload.defaultReplyPolicy === undefined
        ? undefined
        : payload.defaultReplyPolicy === null
          ? Prisma.JsonNull
          : (payload.defaultReplyPolicy as Prisma.InputJsonValue);

    const company = await this.app.prisma.company.update({
      where: { id: companyId },
      data: {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.timezone !== undefined ? { timezone: payload.timezone } : {}),
        ...(defaultReplyPolicy !== undefined ? { defaultReplyPolicy } : {})
      },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        plan: true,
        defaultReplyPolicy: true
      }
    });

    return {
      workspace: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        timezone: company.timezone,
        plan: company.plan.toLowerCase(),
        defaultReplyPolicy: company.defaultReplyPolicy
      }
    };
  }
}
