import { z } from "zod";

export const updateCurrentUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120)
});
