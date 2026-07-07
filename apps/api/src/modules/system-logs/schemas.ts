import { z } from "zod";

export const systemLogLevelSchema = z.enum(["info", "warn", "error"]);

export const listSystemLogsQuerySchema = z.object({
  level: systemLogLevelSchema.optional(),
  module: z.string().min(1).max(128).optional(),
  traceId: z.string().min(1).max(191).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100)
});

export type ListSystemLogsQuery = z.infer<typeof listSystemLogsQuerySchema>;

/**
 * Payload used by out-of-process workers (e.g. ai-worker) to persist a system
 * log through the shared service via the internal API.
 */
export const createSystemLogBodySchema = z.object({
  level: systemLogLevelSchema.default("info"),
  module: z.string().min(1).max(128),
  event: z.string().min(1).max(128),
  traceId: z.string().min(1).max(191).optional().nullable(),
  userId: z.string().min(1).max(191).optional().nullable(),
  companyId: z.string().min(1).max(191).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable()
});

export type CreateSystemLogBody = z.infer<typeof createSystemLogBodySchema>;
