import { z } from "zod";

export const dashboardOverviewQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(90).optional()
});
