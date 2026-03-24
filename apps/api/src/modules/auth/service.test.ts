import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { EmailAuthCodePurpose } from "@prisma/client";
import {
  loginRequestCode,
  loginVerifyCode,
  registerRequestCode,
  registerVerifyCode,
  resendLoginCode
} from "./service.js";

const EMAIL = "user@example.com";
const PASSWORD = "secret123";

function makeApp(overrides: Partial<any> = {}) {
  const redisStore = new Map<string, number>();
  const basePrisma = {
    user: {
      findUnique: async () => null,
      update: async () => ({})
    },
    company: {
      create: async () => ({ id: "company-1", name: "Acme", slug: "acme", plan: "FREE", timezone: "UTC" }),
      findUnique: async () => null
    },
    subscription: {
      findFirst: async () => null,
      create: async () => ({
        id: "sub-1",
        companyId: "company-1",
        plan: "FREE",
        status: "TRIALING",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        trialStartedAt: new Date(),
        trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false
      })
    },
    emailAuthCode: {
      create: async () => ({}),
      findFirst: async () => null,
      update: async () => ({}),
      updateMany: async () => ({ count: 0 })
    },
    $transaction: async (fn: any) => fn(overrides.tx ?? {})
  };

  return {
    config: {
      env: {
        NODE_ENV: "test",
        EMAIL_CODE_TTL_MINUTES: 10,
        EMAIL_CODE_SECRET: "email-code-secret-123456",
        EMAIL_CODE_MAX_ATTEMPTS: 5,
        EMAIL_CODE_RESEND_COOLDOWN_SECONDS: 60,
        SMTP_HOST: "smtp.test",
        SMTP_PORT: 587,
        SMTP_USER: "user",
        SMTP_PASS: "pass",
        SMTP_SECURE: false,
        EMAIL_FROM: "noreply@test.com"
      }
    },
    log: {
      error: () => {}
    },
    redis: {
      incr: async (key: string) => {
        const next = (redisStore.get(key) ?? 0) + 1;
        redisStore.set(key, next);
        return next;
      },
      expire: async () => 1
    },
    jwt: {
      sign: async () => "token-1"
    },
    prisma: {
      ...basePrisma,
      ...(overrides as any).prisma
    },
    ...overrides
  };
}

test("login request-code success with valid credentials", async () => {
  const created: any[] = [];
  const app = makeApp({
    prisma: {
      user: {
        findUnique: async () => ({
          id: "u1",
          email: EMAIL,
          isActive: true,
          passwordHash: await import("bcryptjs").then((m) => m.default.hash(PASSWORD, 12))
        })
      },
      emailAuthCode: {
        updateMany: async () => ({ count: 0 }),
        create: async (args: any) => {
          created.push(args.data);
          return {};
        }
      }
    }
  });

  const response = await loginRequestCode(app as any, { email: EMAIL, password: PASSWORD }, {});
  assert.equal(response.requiresCode, true);
  assert.ok(response.challengeId);
  assert.equal(created[0].purpose, EmailAuthCodePurpose.LOGIN_2FA);
});

test("login request-code fails with bad password", async () => {
  const app = makeApp({
    prisma: {
      user: {
        findUnique: async () => ({
          id: "u1",
          email: EMAIL,
          isActive: true,
          passwordHash: await import("bcryptjs").then((m) => m.default.hash("other-pass", 12))
        })
      }
    }
  });

  await assert.rejects(
    () => loginRequestCode(app as any, { email: EMAIL, password: PASSWORD }, {}),
    (error: any) => error?.code === "INVALID_CREDENTIALS"
  );
});

test("login verify-code fails with invalid code and increments attempts", async () => {
  let attempts = 0;
  const app = makeApp({
    prisma: {
      emailAuthCode: {
        findFirst: async () => ({
          id: "code-1",
          email: EMAIL,
          challengeId: "challenge-1",
          purpose: EmailAuthCodePurpose.LOGIN_2FA,
          codeHash: "invalid_hash",
          expiresAt: new Date(Date.now() + 60_000),
          usedAt: null,
          attemptCount: 0,
          maxAttempts: 5
        }),
        update: async (args: any) => {
          if (args.data?.attemptCount?.increment) attempts += 1;
          return { attemptCount: attempts };
        }
      }
    }
  });

  await assert.rejects(
    () => loginVerifyCode(app as any, { email: EMAIL, challengeId: "challenge-1", code: "123456" }, {}),
    (error: any) => error?.code === "INVALID_CODE"
  );
  assert.equal(attempts, 1);
});

test("register request-code success and register verify-code success", async () => {
  const code = "123456";
  const challengeId = "challenge-r";
  const codeHash = createHmac("sha256", "email-code-secret-123456")
    .update(`${EMAIL}|${EmailAuthCodePurpose.REGISTER}|${challengeId}|${code}`)
    .digest("hex");
  const challenge = {
    id: "code-1",
    email: EMAIL,
    challengeId,
    purpose: EmailAuthCodePurpose.REGISTER,
    codeHash,
    expiresAt: new Date(Date.now() + 10 * 60_000),
    usedAt: null,
    attemptCount: 0,
    maxAttempts: 5,
    payload: {
      fullName: "John Doe",
      companyName: "Acme",
      passwordHash: await import("bcryptjs").then((m) => m.default.hash(PASSWORD, 12))
    }
  };

  const app = makeApp({
    prisma: {
      user: {
        findUnique: async (args: any) => {
          if (args.where?.email === EMAIL) return null;
          return null;
        }
      },
      company: {
        findUnique: async () => null
      },
      emailAuthCode: {
        updateMany: async () => ({ count: 0 }),
        create: async () => ({}),
        findFirst: async () => challenge,
        update: async () => ({})
      },
      $transaction: async (fn: any) =>
        fn({
          company: {
            create: async () => ({ id: "company-1", name: "Acme", slug: "acme", plan: "FREE", timezone: "UTC" })
          },
          user: {
            create: async () => ({
              id: "user-1",
              companyId: "company-1",
              email: EMAIL,
              fullName: "John Doe",
              role: "OWNER"
            })
          },
          emailAuthCode: { update: async () => ({}) }
        })
    }
  });

  await registerRequestCode(
    app as any,
    { email: EMAIL, password: PASSWORD, fullName: "John Doe", companyName: "Acme" },
    {}
  );

  const response = await registerVerifyCode(
    app as any,
    { email: EMAIL, challengeId, code },
    {}
  );
  assert.equal(response.token, "token-1");
});

test("used or expired codes are invalid and resend cooldown works", async () => {
  const app = makeApp({
    prisma: {
      emailAuthCode: {
        findFirst: async () => ({
          id: "code-1",
          email: EMAIL,
          challengeId: "challenge-1",
          purpose: EmailAuthCodePurpose.LOGIN_2FA,
          codeHash: "hash",
          expiresAt: new Date(Date.now() - 1_000),
          usedAt: null,
          attemptCount: 0,
          maxAttempts: 5,
          lastSentAt: new Date()
        }),
        update: async () => ({}),
        updateMany: async () => ({ count: 0 }),
        create: async () => ({})
      }
    }
  });

  await assert.rejects(
    () => loginVerifyCode(app as any, { email: EMAIL, challengeId: "challenge-1", code: "123456" }, {}),
    (error: any) => error?.code === "CODE_EXPIRED"
  );

  const appCooldown = makeApp({
    prisma: {
      emailAuthCode: {
        findFirst: async () => ({
          id: "code-2",
          email: EMAIL,
          challengeId: "challenge-2",
          purpose: EmailAuthCodePurpose.LOGIN_2FA,
          codeHash: "hash",
          expiresAt: new Date(Date.now() + 10_000),
          usedAt: null,
          attemptCount: 0,
          maxAttempts: 5,
          lastSentAt: new Date()
        })
      }
    }
  });

  await assert.rejects(
    () => resendLoginCode(appCooldown as any, { email: EMAIL, challengeId: "challenge-2" }, {}),
    (error: any) => error?.code === "RESEND_COOLDOWN"
  );
});
