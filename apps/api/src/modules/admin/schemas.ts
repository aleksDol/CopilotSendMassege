import { z } from "zod";

export const adminUsersQuerySchema = z.object({
  search: z.string().trim().max(320).optional(),
  filter: z.enum(["all", "active", "inactive"]).default("all")
});

export const updateSubscriptionBodySchema = z.object({
  action: z.enum(["activate", "deactivate", "extend", "shift_period"]),
  extendDays: z.coerce.number().int().min(1).max(3650).optional(),
  periodDeltaDays: z.coerce.number().int().min(-3650).max(3650).refine((v) => v !== 0, "periodDeltaDays cannot be 0").optional()
});

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
export type UpdateSubscriptionBody = z.infer<typeof updateSubscriptionBodySchema>;
