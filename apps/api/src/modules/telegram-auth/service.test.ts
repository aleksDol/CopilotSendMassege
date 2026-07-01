import test from "node:test";
import assert from "node:assert/strict";
import { completeTelegramLogin, registerTelegramUser, startTelegramLogin } from "./service.js";
import { telegramAuthLoginKey } from "./redis-keys.js";
import { AppError } from "../../lib/errors.js";

function makeApp(overrides: Partial<any> = {}) {
  const redisStore = new Map<string, string>();
  const created: { companies: unknown[]; users: unknown[]; identities: unknown[] } = {
    companies: [],
    users: [],
    identities: []
  };

  const basePrisma = {
    company: {
      findUnique: async () => null,
      create: async (args: any) => {
        const company = { id: "company-1", plan: "FREE", timezone: "UTC", ...args.data };
        created.companies.push(company);
        return company;
      }
    },
    telegramIdentity: {
      findUnique: async () => null,
      update: async () => ({}),
      create: async (args: any) => {
        const identity = { id: "identity-1", ...args.data };
        created.identities.push(identity);
        return identity;
      }
    },
    user: {
      update: async () => ({}),
      create: async (args: any) => {
        const user = { id: "user-1", role: "OWNER", isActive: true, ...args.data };
        created.users.push(user);
        return user;
      }
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
    $transaction: async (ops: unknown) => {
      if (typeof ops === "function") {
        return ops(basePrisma);
      }
      return ops;
    }
  };

  return {
    config: {
      env: {
        TELEGRAM_AUTH_BOT_USERNAME: "TestAuthBot"
      }
    },
    log: {
      error: () => {}
    },
    redis: {
      set: async (key: string, value: string) => {
        redisStore.set(key, value);
        return "OK";
      },
      get: async (key: string) => redisStore.get(key) ?? null,
      del: async (key: string) => {
        redisStore.delete(key);
        return 1;
      },
      _store: redisStore
    },
    jwt: {
      sign: async () => "jwt-token"
    },
    prisma: {
      ...basePrisma,
      ...(overrides.prisma ?? {})
    },
    _created: created,
    ...overrides
  };
}

test("startTelegramLogin stores pending session in redis", async () => {
  const app = makeApp();
  const result = await startTelegramLogin(app as any);

  assert.equal(result.botUsername, "TestAuthBot");
  assert.match(result.loginToken, /^[0-9a-f-]{36}$/i);

  const raw = await app.redis.get(telegramAuthLoginKey(result.loginToken));
  assert.equal(JSON.parse(raw as string).status, "pending");
});

test("completeTelegramLogin returns LOGIN_NOT_CONFIRMED for pending session", async () => {
  const app = makeApp();
  const started = await startTelegramLogin(app as any);

  await assert.rejects(
    () => completeTelegramLogin(app as any, { loginToken: started.loginToken }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "LOGIN_NOT_CONFIRMED");
      assert.equal(error.statusCode, 409);
      return true;
    }
  );
});

test("completeTelegramLogin returns registration_required when confirmed without identity", async () => {
  const app = makeApp();
  const started = await startTelegramLogin(app as any);

  await app.redis.set(
    telegramAuthLoginKey(started.loginToken),
    JSON.stringify({
      status: "confirmed",
      telegramUserId: "12345",
      username: "tester",
      firstName: "Test",
      lastName: "User"
    })
  );

  const result = await completeTelegramLogin(app as any, { loginToken: started.loginToken });
  assert.equal(result.status, "registration_required");
  assert.equal(result.loginToken, started.loginToken);
  assert.equal(result.fullName, "Test User");
});

test("completeTelegramLogin returns JWT when confirmed and identity exists", async () => {
  const app = makeApp({
    prisma: {
      telegramIdentity: {
        findUnique: async () => ({
          id: "identity-1",
          user: {
            id: "user-1",
            email: "user@example.com",
            fullName: "User",
            role: "OWNER",
            companyId: "company-1",
            isActive: true,
            company: {
              id: "company-1",
              name: "Acme",
              slug: "acme",
              plan: "FREE",
              timezone: "UTC"
            }
          }
        }),
        update: async () => ({})
      },
      user: {
        update: async () => ({})
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
      $transaction: async (ops: unknown) => ops
    }
  });

  const started = await startTelegramLogin(app as any);
  await app.redis.set(
    telegramAuthLoginKey(started.loginToken),
    JSON.stringify({
      status: "confirmed",
      telegramUserId: "12345"
    })
  );

  const result = await completeTelegramLogin(app as any, { loginToken: started.loginToken });
  assert.equal(result.status, "authenticated");
  assert.equal(result.token, "jwt-token");
  assert.equal(result.user.id, "user-1");
  assert.equal(result.company.id, "company-1");
  assert.equal(await app.redis.get(telegramAuthLoginKey(started.loginToken)), null);
});

test("registerTelegramUser creates company, user, identity and returns JWT", async () => {
  const app = makeApp();
  const started = await startTelegramLogin(app as any);

  await app.redis.set(
    telegramAuthLoginKey(started.loginToken),
    JSON.stringify({
      status: "confirmed",
      telegramUserId: "777",
      username: "founder",
      firstName: "Ivan",
      lastName: "Petrov"
    })
  );

  const result = await registerTelegramUser(app as any, {
    loginToken: started.loginToken,
    companyName: "Acme Sales"
  });

  assert.equal(result.status, "authenticated");
  assert.equal(result.token, "jwt-token");
  assert.equal(app._created.companies.length, 1);
  assert.equal(app._created.users.length, 1);
  assert.equal(app._created.identities.length, 1);
  assert.equal((app._created.users[0] as any).fullName, "Ivan Petrov");
  assert.equal((app._created.users[0] as any).email, "telegram-777@auth.local");
  assert.equal((app._created.identities[0] as any).telegramUserId, "777");
  assert.equal(await app.redis.get(telegramAuthLoginKey(started.loginToken)), null);
});
