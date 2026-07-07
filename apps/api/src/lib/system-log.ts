import { Prisma, type PrismaClient, type SystemLogLevel } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";

/**
 * Minimal internal system log for observability in the admin panel.
 *
 * Guarantees:
 * - Always writes to the Fastify logger (app.log).
 * - Best-effort persists a row into the `system_logs` table.
 * - Never throws: a failed DB write must not break the calling business flow.
 *
 * Do NOT put personal data, tokens or user message content into `metadata`.
 * Keep it strictly technical (runId, entryId, telegramChatId, jobId, errorCode,
 * attempt, duration, ...).
 */
export type SystemLogMetadata = Record<string, unknown>;

export type SystemLogEntry = {
  module: string;
  event: string;
  traceId?: string | null;
  userId?: string | null;
  companyId?: string | null;
  metadata?: SystemLogMetadata | null;
};

export interface SystemLogger {
  info(entry: SystemLogEntry): void;
  warn(entry: SystemLogEntry): void;
  error(entry: SystemLogEntry): void;
}

const toInputJson = (metadata: SystemLogMetadata | null | undefined): Prisma.InputJsonValue | undefined => {
  if (metadata === null || metadata === undefined) {
    return undefined;
  }
  return metadata as Prisma.InputJsonValue;
};

export const createSystemLogger = (logger: FastifyBaseLogger, prisma: PrismaClient): SystemLogger => {
  const write = (level: SystemLogLevel, entry: SystemLogEntry): void => {
    const logPayload = {
      systemLog: true,
      level,
      module: entry.module,
      event: entry.event,
      traceId: entry.traceId ?? undefined,
      userId: entry.userId ?? undefined,
      companyId: entry.companyId ?? undefined,
      metadata: entry.metadata ?? undefined
    };

    // 1. Always write to app.log (the existing Fastify logger).
    logger[level](logPayload, `[system-log] ${entry.module}:${entry.event}`);

    // 2. Best-effort persist to DB. Never throw / never block the caller.
    void prisma.systemLog
      .create({
        data: {
          level,
          module: entry.module,
          event: entry.event,
          traceId: entry.traceId ?? null,
          userId: entry.userId ?? null,
          companyId: entry.companyId ?? null,
          metadata: toInputJson(entry.metadata)
        }
      })
      .catch((error: unknown) => {
        logger.error(
          { err: error, module: entry.module, event: entry.event },
          "[system-log] failed to persist log entry"
        );
      });
  };

  return {
    info: (entry) => write("info", entry),
    warn: (entry) => write("warn", entry),
    error: (entry) => write("error", entry)
  };
};
