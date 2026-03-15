import { z } from "zod";

export const patchWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  timezone: z.string().trim().min(2).max(64).optional(),
  defaultReplyPolicy: z.record(z.string(), z.unknown()).nullable().optional()
});
