import { z } from "zod";

export const dashboardOverviewQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(90).optional(),
  channelAccountId: z.string().uuid().optional()
});

export const dashboardSalesQuerySchema = z.object({
  period: z.enum(["day", "week", "month"]).default("week"),
  channelAccountId: z.string().uuid().optional()
});
