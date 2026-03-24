import { Plan, SubscriptionStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { resolvePlanConfig } from "./plans.js";

const TRIAL_DURATION_DAYS = 3;

export type AccessSubscriptionStatus = "trial" | "active" | "free" | "expired";

export type ResolvedAccessState = {
  subscriptionStatus: AccessSubscriptionStatus;
  isTrialActive: boolean;
  isTrialExpired: boolean;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  timeLeftMs: number | null;
  effectivePlan: Plan;
  limitsPlan: Plan;
};

export const getLatestSubscription = async (app: FastifyInstance, companyId: string) => {
  return app.prisma.subscription.findFirst({
    where: { companyId },
    orderBy: [{ createdAt: "desc" }]
  });
};

export const ensureSubscription = async (
  app: FastifyInstance,
  params: {
    companyId: string;
    plan?: Plan;
    stripeCustomerId?: string | null;
    initializeTrial?: boolean;
  }
) => {
  const existing = await getLatestSubscription(app, params.companyId);
  if (existing) {
    return existing;
  }

  const now = new Date();
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const trialEndsAt = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
  const isTrial = Boolean(params.initializeTrial);

  return app.prisma.subscription.create({
    data: {
      companyId: params.companyId,
      plan: params.plan ?? Plan.FREE,
      status: isTrial ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE,
      stripeCustomerId: params.stripeCustomerId ?? null,
      currentPeriodStart: isTrial ? now : monthEnd,
      currentPeriodEnd: isTrial ? trialEndsAt : monthEnd,
      trialStartedAt: isTrial ? now : null,
      trialEndsAt: isTrial ? trialEndsAt : null
    }
  });
};

export const resolveSubscriptionState = (params: {
  subscription: {
    plan: Plan;
    status: SubscriptionStatus;
    currentPeriodEnd: Date | null;
    trialStartedAt: Date | null;
    trialEndsAt: Date | null;
  };
  companyPlan: Plan;
  now?: Date;
}): ResolvedAccessState => {
  const now = params.now ?? new Date();
  const trialStartedAt = params.subscription.trialStartedAt ?? null;
  const trialEndsAt = params.subscription.trialEndsAt ?? null;
  const hasTrial = Boolean(trialStartedAt && trialEndsAt);
  const isTrialActive = hasTrial && trialEndsAt!.getTime() > now.getTime();
  const isTrialExpired = hasTrial && trialEndsAt!.getTime() <= now.getTime();
  const paidStatuses = new Set<SubscriptionStatus>([SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE]);
  const isPaid = paidStatuses.has(params.subscription.status) && params.subscription.plan !== Plan.FREE;

  if (isTrialActive) {
    return {
      subscriptionStatus: "trial",
      isTrialActive: true,
      isTrialExpired: false,
      trialStartedAt,
      trialEndsAt,
      timeLeftMs: Math.max(0, trialEndsAt!.getTime() - now.getTime()),
      effectivePlan: params.subscription.plan,
      limitsPlan: Plan.TEAM
    };
  }

  if (isPaid) {
    return {
      subscriptionStatus: "active",
      isTrialActive: false,
      isTrialExpired,
      trialStartedAt,
      trialEndsAt,
      timeLeftMs: null,
      effectivePlan: params.subscription.plan,
      limitsPlan: params.subscription.plan
    };
  }

  if (isTrialExpired) {
    return {
      subscriptionStatus: "expired",
      isTrialActive: false,
      isTrialExpired: true,
      trialStartedAt,
      trialEndsAt,
      timeLeftMs: 0,
      effectivePlan: Plan.FREE,
      limitsPlan: Plan.FREE
    };
  }

  return {
    subscriptionStatus: "free",
    isTrialActive: false,
    isTrialExpired: false,
    trialStartedAt,
    trialEndsAt,
    timeLeftMs: null,
    effectivePlan: params.companyPlan,
    limitsPlan: Plan.FREE
  };
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
