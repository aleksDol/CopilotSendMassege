import { z } from "zod";

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, "Phone must be in E.164 format, e.g. +79991234567");

export const telegramConnectStartSchema = z.object({
  phone: phoneSchema
});

export const telegramVerifyCodeSchema = z.object({
  phone: phoneSchema,
  code: z.string().trim().min(3).max(16)
});

export const telegramVerifyPasswordSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1).max(256)
});

export const telegramSyncSchema = z
  .object({
    phone: phoneSchema.optional(),
    dialogsLimit: z.number().int().positive().max(500).optional(),
    messagesPerDialog: z.number().int().positive().max(500).optional()
  })
  .optional()
  .nullable();

export const telegramPollQrSchema = z.object({
  qrSessionId: z.string().uuid()
});

export const telegramVerifyPasswordQrSchema = z.object({
  qrSessionId: z.string().uuid(),
  password: z.string().min(1).max(256)
});
