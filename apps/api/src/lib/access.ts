import type { FastifyInstance, FastifyRequest } from "fastify";
import { AppError } from "./errors.js";
import { getCompanyScope } from "./request-context.js";
import { ensureSubscription, resolveSubscriptionState } from "./billing/subscriptions.js";

export const requireTrialOrActive = (app: FastifyInstance) => {
  return async (request: FastifyRequest) => {
    const scope = getCompanyScope(request);
    const company = await app.prisma.company.findUnique({
      where: { id: scope.companyId },
      select: { plan: true }
    });
    if (!company) {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Company not found");
    }

    const subscription = await ensureSubscription(app, {
      companyId: scope.companyId,
      plan: company.plan
    });

    const access = resolveSubscriptionState({
      subscription,
      companyPlan: company.plan
    });

    if (access.subscriptionStatus !== "trial" && access.subscriptionStatus !== "active") {
      throw new AppError(402, "ACCESS_REQUIRED", "access_required");
    }
  };
};

