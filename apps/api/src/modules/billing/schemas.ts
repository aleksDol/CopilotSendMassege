import { z } from "zod";

export const checkoutSessionBodySchema = z.object({
  plan: z.enum(["pro", "team"])
});
