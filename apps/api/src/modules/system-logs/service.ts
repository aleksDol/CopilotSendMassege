import type { PrismaClient, SystemLog } from "@prisma/client";
import type { ListSystemLogsQuery } from "./schemas.js";

export type SystemLogResponse = {
  id: string;
  createdAt: string;
  level: SystemLog["level"];
  module: string;
  event: string;
  traceId: string | null;
  userId: string | null;
  companyId: string | null;
  metadata: unknown;
};

const mapSystemLog = (row: SystemLog): SystemLogResponse => ({
  id: row.id,
  createdAt: row.createdAt.toISOString(),
  level: row.level,
  module: row.module,
  event: row.event,
  traceId: row.traceId,
  userId: row.userId,
  companyId: row.companyId,
  metadata: row.metadata ?? null
});

export const listSystemLogs = async (
  prisma: PrismaClient,
  query: ListSystemLogsQuery
): Promise<{ logs: SystemLogResponse[] }> => {
  const rows = await prisma.systemLog.findMany({
    where: {
      ...(query.level ? { level: query.level } : {}),
      ...(query.module ? { module: query.module } : {}),
      ...(query.traceId ? { traceId: query.traceId } : {})
    },
    orderBy: { createdAt: "desc" },
    take: query.limit
  });

  return { logs: rows.map(mapSystemLog) };
};
