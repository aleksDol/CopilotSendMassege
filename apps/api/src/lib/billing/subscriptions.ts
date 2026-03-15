import { Plan, SubscriptionStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { resolvePlanConfig } from "./plans.js";

export const getLatestSubscription = async (app: FastifyInstance, companyId: string) => {
  return app.prisma.subscription.findFirst({
    where: { companyId },
    orderBy: [{ createdAt: "desc" }]
  });
};

export const ensureSubscription = async (
  app: FastifyInstance,
  params: { companyId: string; plan?: Plan; stripeCustomerId?: string | null }
) => {
  const existing = await getLatestSubscription(app, params.companyId);
  if (existing) {
    return existing;
  }

  const now = new Date();
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return app.prisma.subscription.create({
    data: {
      companyId: params.companyId,
      plan: params.plan ?? Plan.FREE,
      status: SubscriptionStatus.ACTIVE,
      stripeCustomerId: params.stripeCustomerId ?? null,
      currentPeriodStart: now,
      currentPeriodEnd: monthEnd
    }
  });
};

export const resolveCompanyPlan = (subscriptionPlan: Plan | null | undefined, companyPlan: Plan) => {
  const plan = subscriptionPlan ?? companyPlan;
  return resolvePlanConfig(plan);
};

export const currentUsagePeriod = (subscription: {
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
}) => {
  const now = new Date();
  const start = subscription.currentPeriodStart ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = subscription.currentPeriodEnd ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return { start, end };
};
