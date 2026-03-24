import { ChannelType, Plan, SubscriptionStatus, TelegramLoginStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { getLatestSubscription } from "../../lib/billing/subscriptions.js";
import type { AdminUsersQuery, UpdateSubscriptionBody } from "./schemas.js";

export type AdminSubscriptionUiStatus = "trial" | "active" | "inactive";

export type AdminUserListItem = {
  id: string;
  email: string;
  createdAt: string;
  subscriptionStatus: AdminSubscriptionUiStatus;
  subscriptionExpiresAt: string | null;
  telegramConnected: boolean;
};

const toUiStatus = (sub: {
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
} | null): AdminSubscriptionUiStatus => {
  const now = new Date();

  if (!sub) {
    return "inactive";
  }

  if (sub.status === SubscriptionStatus.TRIALING) {
    return "trial";
  }

  if (sub.status === SubscriptionStatus.ACTIVE) {
    if (sub.currentPeriodEnd && sub.currentPeriodEnd <= now) {
      return "inactive";
    }

    return "active";
  }

  return "inactive";
};

const matchesFilter = (ui: AdminSubscriptionUiStatus, filter: AdminUsersQuery["filter"]) => {
  if (filter === "all") {
    return true;
  }

  if (filter === "active") {
    return ui === "active" || ui === "trial";
  }

  return ui === "inactive";
};

export const listAdminUsers = async (app: FastifyInstance, query: AdminUsersQuery): Promise<AdminUserListItem[]> => {
  const users = await app.prisma.user.findMany({
    where: query.search
      ? {
          email: {
            contains: query.search,
            mode: "insensitive"
          }
        }
      : {},
    select: {
      id: true,
      email: true,
      createdAt: true,
      companyId: true
    },
    orderBy: { createdAt: "desc" }
  });

  const companyIds = Array.from(new Set(users.map((user) => user.companyId)));
  const [subscriptions, telegramAccounts] = await Promise.all([
    app.prisma.subscription.findMany({
      where: { companyId: { in: companyIds } },
      orderBy: [{ companyId: "asc" }, { createdAt: "desc" }]
    }),
    app.prisma.channelAccount.findMany({
      where: {
        companyId: { in: companyIds },
        channelType: ChannelType.TELEGRAM
      },
      select: {
        companyId: true,
        telegram: {
          select: {
            loginStatus: true
          }
        }
      }
    })
  ]);

  const latestSubscriptionByCompany = new Map<string, (typeof subscriptions)[number]>();
  for (const sub of subscriptions) {
    if (!latestSubscriptionByCompany.has(sub.companyId)) {
      latestSubscriptionByCompany.set(sub.companyId, sub);
    }
  }

  const telegramConnectedByCompany = new Map<string, boolean>();
  for (const account of telegramAccounts) {
    if (!telegramConnectedByCompany.has(account.companyId)) {
      telegramConnectedByCompany.set(account.companyId, false);
    }
    if (account.telegram?.loginStatus === TelegramLoginStatus.CONNECTED) {
      telegramConnectedByCompany.set(account.companyId, true);
    }
  }

  const rows: AdminUserListItem[] = [];

  for (const user of users) {
    const latest = latestSubscriptionByCompany.get(user.companyId) ?? null;
    const ui = toUiStatus(latest);

    if (!matchesFilter(ui, query.filter)) {
      continue;
    }

    rows.push({
      id: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      subscriptionStatus: ui,
      subscriptionExpiresAt: latest?.currentPeriodEnd ? latest.currentPeriodEnd.toISOString() : null,
      telegramConnected: telegramConnectedByCompany.get(user.companyId) ?? false
    });
  }

  return rows;
};

export const updateSubscriptionForUser = async (
  app: FastifyInstance,
  targetUserId: string,
  body: UpdateSubscriptionBody
) => {
  const user = await app.prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, companyId: true }
  });

  if (!user) {
    throw new AppError(404, "NOT_FOUND", "User not found");
  }

  const now = new Date();
  const extendDays = body.extendDays ?? 30;
  const extendMs = extendDays * 24 * 60 * 60 * 1000;

  let sub = await getLatestSubscription(app, user.companyId);

  if (body.action === "activate") {
    const end = new Date(now.getTime() + extendMs);

    if (!sub) {
      const company = await app.prisma.company.findUnique({
        where: { id: user.companyId },
        select: { plan: true }
      });

      await app.prisma.subscription.create({
        data: {
          companyId: user.companyId,
          plan: company?.plan ?? Plan.FREE,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: now,
          currentPeriodEnd: end
        }
      });

      return { ok: true as const };
    }

    const nextEnd =
      sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : end;

    await app.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: sub.currentPeriodStart ?? now,
        currentPeriodEnd: nextEnd
      }
    });

    return { ok: true as const };
  }

  if (body.action === "deactivate") {
    if (!sub) {
      return { ok: true as const };
    }

    await app.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: SubscriptionStatus.CANCELED }
    });

    return { ok: true as const };
  }

  if (body.action === "extend") {
    if (!sub) {
      const company = await app.prisma.company.findUnique({
        where: { id: user.companyId },
        select: { plan: true }
      });

      await app.prisma.subscription.create({
        data: {
          companyId: user.companyId,
          plan: company?.plan ?? Plan.FREE,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + extendMs)
        }
      });

      return { ok: true as const };
    }

    const base = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
    const nextStatus =
      sub.status === SubscriptionStatus.CANCELED ? SubscriptionStatus.ACTIVE : sub.status;

    await app.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        currentPeriodEnd: new Date(base.getTime() + extendMs),
        status: nextStatus
      }
    });

    return { ok: true as const };
  }

  if (body.action === "shift_period") {
    if (!sub) {
      throw new AppError(400, "SUBSCRIPTION_NOT_FOUND", "Subscription not found for this user");
    }

    if (!body.periodDeltaDays) {
      throw new AppError(400, "VALIDATION_ERROR", "periodDeltaDays is required for shift_period");
    }

    const deltaMs = body.periodDeltaDays * 24 * 60 * 60 * 1000;
    const base = sub.currentPeriodEnd ?? now;
    const nextEnd = new Date(base.getTime() + deltaMs);
    const trialEndBase = sub.trialEndsAt ?? sub.currentPeriodEnd ?? now;
    const nextTrialEnd = new Date(trialEndBase.getTime() + deltaMs);

    const updateData: {
      currentPeriodEnd: Date;
      trialEndsAt?: Date;
    } = {
      currentPeriodEnd: nextEnd
    };
    if (sub.status === SubscriptionStatus.TRIALING || sub.trialEndsAt) {
      updateData.trialEndsAt = nextTrialEnd;
    }

    await app.prisma.subscription.update({
      where: { id: sub.id },
      data: updateData
    });

    return { ok: true as const };
  }

  throw new AppError(400, "VALIDATION_ERROR", "Unsupported action");
};
