import type { FastifyInstance } from "fastify";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { EmailAuthCodePurpose, Prisma } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { BillingService } from "../billing/service.js";
import { ensureSubscription, resolveSubscriptionState } from "../../lib/billing/subscriptions.js";
import { EmailService } from "../../lib/email.js";
import { toPublicCompany, toPublicUser } from "../../lib/mappers.js";
import { hashPassword, verifyPassword } from "../../lib/security.js";
import { slugify } from "../../lib/slug.js";

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

const AUTH_CODE_TTL_MS = (app: FastifyInstance) => app.config.env.EMAIL_CODE_TTL_MINUTES * 60 * 1000;

const buildCodeHash = (
  app: FastifyInstance,
  email: string,
  purpose: EmailAuthCodePurpose,
  challengeId: string,
  code: string
) =>
  createHmac("sha256", app.config.env.EMAIL_CODE_SECRET)
    .update(`${email.toLowerCase()}|${purpose}|${challengeId}|${code}`)
    .digest("hex");

const verifyCodeHash = (
  app: FastifyInstance,
  email: string,
  purpose: EmailAuthCodePurpose,
  challengeId: string,
  code: string,
  storedHash: string
): boolean => {
  const expected = buildCodeHash(app, email, purpose, challengeId, code);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const storedBuffer = Buffer.from(storedHash, "utf8");
  if (expectedBuffer.length !== storedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, storedBuffer);
};

const generateSixDigitCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");

const createChallengeId = () => randomBytes(24).toString("hex");

const ensureRateLimit = async (app: FastifyInstance, key: string, limit: number, windowSec: number, message: string) => {
  const count = await app.redis.incr(key);
  if (count === 1) {
    await app.redis.expire(key, windowSec);
  }
  if (count > limit) {
    throw new AppError(429, "RATE_LIMIT_EXCEEDED", message);
  }
};

const invalidateActiveCodes = async (app: FastifyInstance, email: string, purpose: EmailAuthCodePurpose) => {
  await app.prisma.emailAuthCode.updateMany({
    where: {
      email,
      purpose,
      usedAt: null
    },
    data: {
      usedAt: new Date()
    }
  });
};

const sendCodeEmail = async (
  app: FastifyInstance,
  purpose: EmailAuthCodePurpose,
  email: string,
  code: string
) => {
  const emailService = new EmailService(app);
  const isLogin = purpose === EmailAuthCodePurpose.LOGIN_2FA;
  const subject = isLogin
    ? "Код подтверждения входа в AI Sales Assistant"
    : "Подтверждение регистрации в AI Sales Assistant";
  const text = `Ваш код подтверждения: ${code}\nОн действует ${app.config.env.EMAIL_CODE_TTL_MINUTES} минут.`;
  await emailService.send({ to: email, subject, text });
};

const createAuthCodeChallenge = async (
  app: FastifyInstance,
  params: {
    email: string;
    purpose: EmailAuthCodePurpose;
    ipAddress?: string;
    userAgent?: string;
    payload?: Record<string, unknown>;
  }
) => {
  const now = new Date();
  const code = generateSixDigitCode();
  const challengeId = createChallengeId();
  const expiresAt = new Date(now.getTime() + AUTH_CODE_TTL_MS(app));
  const codeHash = buildCodeHash(app, params.email, params.purpose, challengeId, code);

  await invalidateActiveCodes(app, params.email, params.purpose);

  await app.prisma.emailAuthCode.create({
    data: {
      email: params.email,
      challengeId,
      codeHash,
      purpose: params.purpose,
      expiresAt,
      maxAttempts: app.config.env.EMAIL_CODE_MAX_ATTEMPTS,
      lastSentAt: now,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      payload: params.payload as Prisma.InputJsonValue | undefined
    }
  });

  await sendCodeEmail(app, params.purpose, params.email, code);

  return {
    requiresCode: true,
    challengeId
  };
};

const getValidChallengeOrThrow = async (app: FastifyInstance, email: string, challengeId: string, purpose: EmailAuthCodePurpose) => {
  const challenge = await app.prisma.emailAuthCode.findFirst({
    where: { email, challengeId, purpose }
  });

  if (!challenge) {
    throw new AppError(400, "INVALID_CHALLENGE", "Verification session not found");
  }

  if (challenge.usedAt) {
    throw new AppError(400, "CODE_ALREADY_USED", "Verification code has already been used");
  }

  if (challenge.attemptCount >= challenge.maxAttempts) {
    await app.prisma.emailAuthCode.update({
      where: { id: challenge.id },
      data: { usedAt: new Date() }
    });
    throw new AppError(429, "CODE_ATTEMPTS_EXCEEDED", "Too many invalid code attempts");
  }

  if (challenge.expiresAt.getTime() <= Date.now()) {
    await app.prisma.emailAuthCode.update({
      where: { id: challenge.id },
      data: { usedAt: new Date() }
    });
    throw new AppError(400, "CODE_EXPIRED", "Verification code has expired");
  }

  return challenge;
};

const markAttemptFailed = async (app: FastifyInstance, challengeId: string, challengeMaxAttempts: number) => {
  const updated = await app.prisma.emailAuthCode.update({
    where: { id: challengeId },
    data: {
      attemptCount: { increment: 1 }
    },
    select: { attemptCount: true }
  });

  if (updated.attemptCount >= challengeMaxAttempts) {
    await app.prisma.emailAuthCode.update({
      where: { id: challengeId },
      data: { usedAt: new Date() }
    });
    throw new AppError(429, "CODE_ATTEMPTS_EXCEEDED", "Too many invalid code attempts");
  }
};

export const registerUser = async (
  app: FastifyInstance,
  payload: { fullName: string; email: string; password: string; companyName: string }
) => {
  const billingService = new BillingService(app);
  const email = payload.email.toLowerCase();
  const slug = await buildUniqueCompanySlug(app, payload.companyName);
  const passwordHash = await hashPassword(payload.password);

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
        fullName: payload.fullName,
        role: "OWNER"
      }
    });

    return { user: createdUser, company: createdCompany };
  });

  const token = await signAccessToken(app, user.id, company.id);

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

  const subscription = await ensureSubscription(app, {
    companyId: company.id,
    plan: company.plan
  });
  const access = resolveSubscriptionState({
    subscription,
    companyPlan: company.plan
  });

  return {
    user: toPublicUser(user),
    company: toPublicCompany(company),
    access,
    token
  };
};

export const loginUser = async (
  app: FastifyInstance,
  payload: { email: string; password: string }
) => {
  const email = payload.email.toLowerCase();

  const user = await app.prisma.user.findUnique({
    where: { email },
    include: {
      company: true
    }
  });

  if (!user || !user.isActive) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const isValidPassword = await verifyPassword(payload.password, user.passwordHash);

  if (!isValidPassword) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  await app.prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date()
    }
  });

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
    user: toPublicUser(user),
    company: toPublicCompany(user.company),
    access,
    token
  };
};

export const getMe = async (app: FastifyInstance, userId: string) => {
  const user = await app.prisma.user.findUnique({
    where: { id: userId },
    include: {
      company: true
    }
  });

  if (!user || !user.isActive) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
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

export const loginRequestCode = async (
  app: FastifyInstance,
  payload: { email: string; password: string },
  requestMeta: { ipAddress?: string; userAgent?: string }
) => {
  const email = payload.email.toLowerCase();
  await ensureRateLimit(
    app,
    `auth:login:request-code:${email}:${requestMeta.ipAddress ?? "unknown"}`,
    10,
    900,
    "Too many login code requests"
  );

  const user = await app.prisma.user.findUnique({
    where: { email }
  });

  if (!user || !user.isActive) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const isValidPassword = await verifyPassword(payload.password, user.passwordHash);
  if (!isValidPassword) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  return createAuthCodeChallenge(app, {
    email,
    purpose: EmailAuthCodePurpose.LOGIN_2FA,
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent
  });
};

export const resendLoginCode = async (
  app: FastifyInstance,
  payload: { email: string; challengeId: string },
  requestMeta: { ipAddress?: string; userAgent?: string }
) => {
  const email = payload.email.toLowerCase();
  const challenge = await getValidChallengeOrThrow(app, email, payload.challengeId, EmailAuthCodePurpose.LOGIN_2FA);
  const cooldownMs = app.config.env.EMAIL_CODE_RESEND_COOLDOWN_SECONDS * 1000;
  if (Date.now() - challenge.lastSentAt.getTime() < cooldownMs) {
    throw new AppError(429, "RESEND_COOLDOWN", "Please wait before requesting another code");
  }
  return createAuthCodeChallenge(app, {
    email,
    purpose: EmailAuthCodePurpose.LOGIN_2FA,
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent
  });
};

export const loginVerifyCode = async (
  app: FastifyInstance,
  payload: { email: string; challengeId: string; code: string },
  requestMeta: { ipAddress?: string }
) => {
  const email = payload.email.toLowerCase();
  await ensureRateLimit(
    app,
    `auth:login:verify-code:${email}:${requestMeta.ipAddress ?? "unknown"}`,
    20,
    900,
    "Too many code verification attempts"
  );
  const challenge = await getValidChallengeOrThrow(app, email, payload.challengeId, EmailAuthCodePurpose.LOGIN_2FA);

  const isValidCode = verifyCodeHash(
    app,
    email,
    EmailAuthCodePurpose.LOGIN_2FA,
    payload.challengeId,
    payload.code,
    challenge.codeHash
  );
  if (!isValidCode) {
    await markAttemptFailed(app, challenge.id, challenge.maxAttempts);
    throw new AppError(400, "INVALID_CODE", "Invalid verification code");
  }

  const user = await app.prisma.user.findUnique({
    where: { email },
    include: { company: true }
  });
  if (!user || !user.isActive) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  await app.prisma.$transaction([
    app.prisma.emailAuthCode.update({
      where: { id: challenge.id },
      data: { usedAt: new Date() }
    }),
    app.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    })
  ]);

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
    user: toPublicUser(user),
    company: toPublicCompany(user.company),
    access,
    token
  };
};

export const registerRequestCode = async (
  app: FastifyInstance,
  payload: { fullName: string; email: string; password: string; companyName: string },
  requestMeta: { ipAddress?: string; userAgent?: string }
) => {
  const email = payload.email.toLowerCase();
  await ensureRateLimit(
    app,
    `auth:register:request-code:${email}:${requestMeta.ipAddress ?? "unknown"}`,
    10,
    900,
    "Too many registration code requests"
  );

  const existing = await app.prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw new AppError(409, "EMAIL_ALREADY_EXISTS", "Email is already registered");
  }

  const passwordHash = await hashPassword(payload.password);
  return createAuthCodeChallenge(app, {
    email,
    purpose: EmailAuthCodePurpose.REGISTER,
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent,
    payload: {
      fullName: payload.fullName,
      companyName: payload.companyName,
      passwordHash
    }
  });
};

export const resendRegisterCode = async (
  app: FastifyInstance,
  payload: { email: string; challengeId: string },
  requestMeta: { ipAddress?: string; userAgent?: string }
) => {
  const email = payload.email.toLowerCase();
  const challenge = await getValidChallengeOrThrow(app, email, payload.challengeId, EmailAuthCodePurpose.REGISTER);
  const cooldownMs = app.config.env.EMAIL_CODE_RESEND_COOLDOWN_SECONDS * 1000;
  if (Date.now() - challenge.lastSentAt.getTime() < cooldownMs) {
    throw new AppError(429, "RESEND_COOLDOWN", "Please wait before requesting another code");
  }

  const challengePayload = challenge.payload as { fullName?: string; companyName?: string; passwordHash?: string } | null;
  if (!challengePayload?.passwordHash || !challengePayload?.fullName || !challengePayload?.companyName) {
    throw new AppError(400, "INVALID_CHALLENGE", "Registration verification session is invalid");
  }

  return createAuthCodeChallenge(app, {
    email,
    purpose: EmailAuthCodePurpose.REGISTER,
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent,
    payload: challengePayload
  });
};

export const registerVerifyCode = async (
  app: FastifyInstance,
  payload: { email: string; challengeId: string; code: string },
  requestMeta: { ipAddress?: string }
) => {
  const email = payload.email.toLowerCase();
  await ensureRateLimit(
    app,
    `auth:register:verify-code:${email}:${requestMeta.ipAddress ?? "unknown"}`,
    20,
    900,
    "Too many code verification attempts"
  );

  const challenge = await getValidChallengeOrThrow(app, email, payload.challengeId, EmailAuthCodePurpose.REGISTER);
  const isValidCode = verifyCodeHash(
    app,
    email,
    EmailAuthCodePurpose.REGISTER,
    payload.challengeId,
    payload.code,
    challenge.codeHash
  );
  if (!isValidCode) {
    await markAttemptFailed(app, challenge.id, challenge.maxAttempts);
    throw new AppError(400, "INVALID_CODE", "Invalid verification code");
  }

  const challengePayload = challenge.payload as { fullName?: string; companyName?: string; passwordHash?: string } | null;
  if (!challengePayload?.passwordHash || !challengePayload?.fullName || !challengePayload?.companyName) {
    throw new AppError(400, "INVALID_CHALLENGE", "Registration verification session is invalid");
  }

  const existingUser = await app.prisma.user.findUnique({
    where: { email },
    select: { id: true }
  });
  if (existingUser) {
    throw new AppError(409, "EMAIL_ALREADY_EXISTS", "Email is already registered");
  }

  const billingService = new BillingService(app);
  const slug = await buildUniqueCompanySlug(app, challengePayload.companyName);
  const { user, company } = await app.prisma.$transaction(async (tx) => {
    const createdCompany = await tx.company.create({
      data: {
        name: challengePayload.companyName as string,
        slug
      }
    });

    const createdUser = await tx.user.create({
      data: {
        companyId: createdCompany.id,
        email,
        passwordHash: challengePayload.passwordHash as string,
        fullName: challengePayload.fullName as string,
        role: "OWNER"
      }
    });

    await tx.emailAuthCode.update({
      where: { id: challenge.id },
      data: { usedAt: new Date() }
    });

    return { user: createdUser, company: createdCompany };
  });

  const token = await signAccessToken(app, user.id, company.id);
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

  const subscription = await ensureSubscription(app, {
    companyId: company.id,
    plan: company.plan
  });
  const access = resolveSubscriptionState({
    subscription,
    companyPlan: company.plan
  });

  return {
    user: toPublicUser(user),
    company: toPublicCompany(company),
    access,
    token
  };
};
