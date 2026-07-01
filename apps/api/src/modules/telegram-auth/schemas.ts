import { z } from "zod";

export const telegramAuthCompleteBodySchema = z.object({
  loginToken: z.string().uuid()
});

export const telegramAuthRegisterBodySchema = z.object({
  loginToken: z.string().uuid(),
  companyName: z.string().trim().min(2).max(120)
});
