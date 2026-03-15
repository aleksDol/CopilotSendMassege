import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { BillingService } from "../billing/service.js";
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
      companyName: company.name
    });
  } catch (error) {
    app.log.error({ err: error, companyId: company.id }, "Failed to initialize billing customer");
  }

  return {
    user: toPublicUser(user),
    company: toPublicCompany(company),
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

  return {
    user: toPublicUser(user),
    company: toPublicCompany(user.company),
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

  return {
    user: toPublicUser(user),
    company: toPublicCompany(user.company)
  };
};
