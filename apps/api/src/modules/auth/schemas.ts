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

const challengeIdSchema = z.string().trim().min(20).max(200);
const emailCodeSchema = z.string().regex(/^\d{6}$/);

export const loginRequestCodeBodySchema = loginBodySchema;

export const loginVerifyCodeBodySchema = z.object({
  email: z.string().trim().email(),
  challengeId: challengeIdSchema,
  code: emailCodeSchema
});

export const registerRequestCodeBodySchema = registerBodySchema;

export const registerVerifyCodeBodySchema = z.object({
  email: z.string().trim().email(),
  challengeId: challengeIdSchema,
  code: emailCodeSchema
});

export const resendCodeBodySchema = z.object({
  email: z.string().trim().email(),
  challengeId: challengeIdSchema
});
