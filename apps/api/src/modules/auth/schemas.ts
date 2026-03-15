import { z } from "zod";

export const registerBodySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  companyName: z.string().trim().min(2).max(120)
});

export const loginBodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128)
});
