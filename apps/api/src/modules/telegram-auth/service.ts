import { randomBytes, randomUUID } from "node:crypto";
import { UserRole, type Company, type User } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { BillingService } from "../billing/service.js";
import { ensureSubscription, resolveSubscriptionState } from "../../lib/billing/subscriptions.js";
import { toPublicCompany, toPublicUser } from "../../lib/mappers.js";
import { slugify } from "../../lib/slug.js";
import {
  TELEGRAM_AUTH_LOGIN_TTL_SECONDS,
  telegramAuthLoginKey,
  type TelegramAuthLoginSession
} from "./redis-keys.js";

const signAccessToken = async (app: FastifyInstance, userId: string, companyId: string): Promise<string> =>
  app.jwt.sign(
    {
      companyId
    },
    {
      sub: userId,
      expiresIn: "7d"
    }
  );

const parseLoginSession = (raw: string | null): TelegramAuthLoginSession | null => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as TelegramAuthLoginSession;
  } catch {
    return null;
  }
};

const ensureTelegramAuthConfigured = (app: FastifyInstance) => {
  const botUsername = app.config.env.TELEGRAM_AUTH_BOT_USERNAME?.trim();
  if (!botUsername) {
    throw new AppError(503, "TELEGRAM_AUTH_UNAVAILABLE", "Telegram login is not configured");
  }
  return botUsername;
};

const getConfirmedSessionOrThrow = async (app: FastifyInstance, loginToken: string) => {
  const raw = await app.redis.get(telegramAuthLoginKey(loginToken));
  const session = parseLoginSession(raw);

  if (!session) {
    throw new AppError(404, "LOGIN_TOKEN_EXPIRED", "Login session has expired. Start again.");
  }

  if (session.status !== "confirmed" || !session.telegramUserId) {
    throw new AppError(409, "LOGIN_NOT_CONFIRMED", "Telegram login has not been confirmed yet");
  }

  return session;
};

const buildUniqueCompanySlug = async (app: FastifyInstance, companyName: string): Promise<string> => {
  const baseSlug = slugify(companyName);

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;

    const existing = await app.prisma.company.findUnique({
      where: { slug: candidate },
      select: { id: true }
    });

    if (!existing) {
      return candidate;
    }
  }

  throw new AppError(500, "SLUG_GENERATION_FAILED", "Failed to generate company slug");
};

const buildFullNameFromTelegram = (session: TelegramAuthLoginSession): string => {
  const fullName = [session.firstName, session.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

  if (fullName) {
    return fullName.slice(0, 120);
  }

  if (session.username?.trim()) {
    return session.username.trim().slice(0, 120);
  }

  return "Telegram User";
};

const buildTelegramPlaceholderEmail = (telegramUserId: string) => `telegram-${telegramUserId}@auth.local`;

const buildSessionResponse = async (app: FastifyInstance, user: User & { company: Company }) => {
  const token = await signAccessToken(app, user.id, user.companyId);
  const subscription = await ensureSubscription(app, {
    companyId: user.company.id,
    plan: user.company.plan
  });
  const access = resolveSubscriptionState({
    subscription,
    companyPlan: user.company.plan
  });

  return {
    status: "authenticated" as const,
    user: toPublicUser(user),
    company: toPublicCompany(user.company),
    access,
    token
  };
};

export const startTelegramLogin = async (app: FastifyInstance) => {
  const botUsername = ensureTelegramAuthConfigured(app);
  const loginToken = randomUUID();
  const traceId = randomUUID();
  const session: TelegramAuthLoginSession = { status: "pending", traceId };

  await app.redis.set(
    telegramAuthLoginKey(loginToken),
    JSON.stringify(session),
    "EX",
    TELEGRAM_AUTH_LOGIN_TTL_SECONDS
  );

  app.systemLog.info({
    module: "telegram-login",
    event: "TelegramLoginStarted",
    traceId
  });

  return {
    loginToken,
    botUsername
  };
};

export const completeTelegramLogin = async (app: FastifyInstance, payload: { loginToken: string }) => {
  const session = await getConfirmedSessionOrThrow(app, payload.loginToken);

  app.systemLog.info({
    module: "telegram-login",
    event: "TelegramLoginConfirmed",
    traceId: session.traceId
  });

  const identity = await app.prisma.telegramIdentity.findUnique({
    where: { telegramUserId: session.telegramUserId },
    include: {
      user: {
        include: {
          company: true
        }
      }
    }
  });

  if (!identity || !identity.user.isActive) {
    return {
      status: "registration_required" as const,
      loginToken: payload.loginToken,
      fullName: buildFullNameFromTelegram(session)
    };
  }

  const now = new Date();

  await app.prisma.$transaction([
    app.prisma.telegramIdentity.update({
      where: { id: identity.id },
      data: { lastAuthAt: now }
    }),
    app.prisma.user.update({
      where: { id: identity.user.id },
      data: { lastLoginAt: now }
    })
  ]);

  const authenticated = await buildSessionResponse(app, identity.user);

  await app.redis.del(telegramAuthLoginKey(payload.loginToken));

  return authenticated;
};

export const registerTelegramUser = async (
  app: FastifyInstance,
  payload: { loginToken: string; companyName: string }
) => {
  const session = await getConfirmedSessionOrThrow(app, payload.loginToken);
  const telegramUserId = session.telegramUserId as string;

  const existingIdentity = await app.prisma.telegramIdentity.findUnique({
    where: { telegramUserId },
    select: { id: true }
  });

  if (existingIdentity) {
    throw new AppError(409, "TELEGRAM_ALREADY_REGISTERED", "This Telegram account is already registered");
  }

  const billingService = new BillingService(app);
  const fullName = buildFullNameFromTelegram(session);
  const email = buildTelegramPlaceholderEmail(telegramUserId);
  // Email/password login is removed. Keep column compatibility by storing a random value.
  const passwordHash = randomBytes(32).toString("hex");
  const slug = await buildUniqueCompanySlug(app, payload.companyName);
  const now = new Date();

  const { user, company } = await app.prisma.$transaction(async (tx) => {
    const createdCompany = await tx.company.create({
      data: {
        name: payload.companyName,
        slug
      }
    });

    const createdUser = await tx.user.create({
      data: {
        companyId: createdCompany.id,
        email,
        passwordHash,
        fullName,
        role: UserRole.OWNER,
        lastLoginAt: now
      }
    });

    await tx.telegramIdentity.create({
      data: {
        userId: createdUser.id,
        telegramUserId,
        username: session.username ?? null,
        firstName: session.firstName ?? null,
        lastName: session.lastName ?? null,
        photoUrl: session.photoUrl ?? null,
        linkedAt: now,
        lastAuthAt: now
      }
    });

    return { user: createdUser, company: createdCompany };
  });

  try {
    await billingService.createCustomerForCompany({
      companyId: company.id,
      email,
      companyName: company.name,
      initializeTrial: true
    });
  } catch (error) {
    app.log.error({ err: error, companyId: company.id }, "Failed to initialize billing customer");
  }

  app.systemLog.info({
    module: "telegram-login",
    event: "TelegramRegistered",
    traceId: session.traceId,
    userId: user.id,
    companyId: company.id
  });

  const authenticated = await buildSessionResponse(app, {
    ...user,
    company
  });

  await app.redis.del(telegramAuthLoginKey(payload.loginToken));

  return authenticated;
};

export const getTelegramIdentityForUser = async (app: FastifyInstance, userId: string) => {
  const identity = await app.prisma.telegramIdentity.findUnique({
    where: { userId },
    select: {
      telegramUserId: true,
      username: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      linkedAt: true,
      lastAuthAt: true
    }
  });

  return {
    telegram: identity
      ? {
          telegramUserId: identity.telegramUserId,
          username: identity.username,
          firstName: identity.firstName,
          lastName: identity.lastName,
          photoUrl: identity.photoUrl,
          linkedAt: identity.linkedAt,
          lastAuthAt: identity.lastAuthAt
        }
      : null
  };
};
