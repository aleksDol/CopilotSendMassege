import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyBaseLogger } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { createSystemLogger } from "./system-log.js";

type LoggerCall = { level: string; obj: unknown; msg?: string };

const createFakeLogger = () => {
  const calls: LoggerCall[] = [];
  const make = (level: string) => (obj: unknown, msg?: string) => {
    calls.push({ level, obj, msg });
  };
  const logger = {
    info: make("info"),
    warn: make("warn"),
    error: make("error"),
    fatal: make("fatal"),
    debug: make("debug"),
    trace: make("trace")
  } as unknown as FastifyBaseLogger;
  return { logger, calls };
};

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

test("createSystemLogger writes to the logger and persists to the DB", async () => {
  const { logger, calls } = createFakeLogger();
  const created: unknown[] = [];
  const prisma = {
    systemLog: {
      create: async ({ data }: { data: unknown }) => {
        created.push(data);
        return data;
      }
    }
  } as unknown as PrismaClient;

  const systemLog = createSystemLogger(logger, prisma);

  systemLog.info({ module: "marketplace", event: "MarketplaceStart", traceId: "t-1", metadata: { runId: "r-1" } });

  await flushMicrotasks();

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.level, "info");
  assert.deepEqual(created, [
    {
      level: "info",
      module: "marketplace",
      event: "MarketplaceStart",
      traceId: "t-1",
      userId: null,
      companyId: null,
      metadata: { runId: "r-1" }
    }
  ]);
});

test("createSystemLogger never throws when the DB write fails", async () => {
  const { logger, calls } = createFakeLogger();
  const prisma = {
    systemLog: {
      create: async () => {
        throw new Error("db unavailable");
      }
    }
  } as unknown as PrismaClient;

  const systemLog = createSystemLogger(logger, prisma);

  assert.doesNotThrow(() => {
    systemLog.error({ module: "join-worker", event: "JoinFailed", metadata: { errorCode: "HTTP_500" } });
  });

  await flushMicrotasks();

  // The primary log line plus the persistence-failure log line.
  assert.equal(calls.some((c) => c.level === "error" && c.msg?.includes("failed to persist")), true);
});
