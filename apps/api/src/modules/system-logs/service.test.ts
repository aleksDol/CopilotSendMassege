import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { listSystemLogs } from "./service.js";

const baseRow = {
  id: "log-1",
  createdAt: new Date("2026-07-07T10:00:00.000Z"),
  level: "info" as const,
  module: "marketplace",
  event: "MarketplaceStart",
  traceId: "trace-1",
  userId: "user-1",
  companyId: "company-1",
  metadata: { runId: "run-1" }
};

const createFakePrisma = () => {
  const findManyArgs: unknown[] = [];
  const prisma = {
    systemLog: {
      findMany: async (args: unknown) => {
        findManyArgs.push(args);
        return [baseRow];
      }
    }
  } as unknown as PrismaClient;
  return { prisma, findManyArgs };
};

test("listSystemLogs applies filters and maps rows", async () => {
  const { prisma, findManyArgs } = createFakePrisma();

  const result = await listSystemLogs(prisma, {
    level: "info",
    module: "marketplace",
    traceId: "trace-1",
    limit: 25
  });

  assert.deepEqual(findManyArgs[0], {
    where: { level: "info", module: "marketplace", traceId: "trace-1" },
    orderBy: { createdAt: "desc" },
    take: 25
  });

  assert.deepEqual(result.logs, [
    {
      id: "log-1",
      createdAt: "2026-07-07T10:00:00.000Z",
      level: "info",
      module: "marketplace",
      event: "MarketplaceStart",
      traceId: "trace-1",
      userId: "user-1",
      companyId: "company-1",
      metadata: { runId: "run-1" }
    }
  ]);
});

test("listSystemLogs omits empty filters from the where clause", async () => {
  const { prisma, findManyArgs } = createFakePrisma();

  await listSystemLogs(prisma, { limit: 100 });

  assert.deepEqual(findManyArgs[0], {
    where: {},
    orderBy: { createdAt: "desc" },
    take: 100
  });
});
