import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { toPublicCompany, toPublicUser } from "../../lib/mappers.js";
import { ensureSubscription, resolveSubscriptionState } from "../../lib/billing/subscriptions.js";

export const getCurrentUserProfile = async (app: FastifyInstance, userId: string) => {
  const user = await app.prisma.user.findUnique({
    where: { id: userId },
    include: {
      company: true
    }
  });

  if (!user || !user.isActive) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const subscription = await ensureSubscription(app, {
    companyId: user.company.id,
    plan: user.company.plan
  });
  const access = resolveSubscriptionState({
    subscription,
    companyPlan: user.company.plan
  });

  return {
    user: toPublicUser(user),
    company: toPublicCompany(user.company),
    access
  };
};

export const updateCurrentUser = async (app: FastifyInstance, userId: string, payload: { fullName: string }) => {
  const user = await app.prisma.user.update({
    where: { id: userId },
    data: {
      fullName: payload.fullName
    },
    include: {
      company: true
    }
  });

  return {
    user: toPublicUser(user),
    company: toPublicCompany(user.company)
  };
};
