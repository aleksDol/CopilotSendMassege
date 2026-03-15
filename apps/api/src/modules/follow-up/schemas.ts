import { z } from "zod";

export const runFollowUpBodySchema = z
  .object({
    companyId: z.string().uuid().optional(),
    dryRun: z.boolean().optional().default(false)
  })
  .optional();
