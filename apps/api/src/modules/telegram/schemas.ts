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
    channelAccountId: z.string().uuid().optional(),
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

export const telegramAccountQuerySchema = z.object({
  channelAccountId: z.string().uuid().optional()
});

export const telegramAccountIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const patchTelegramAccountBodySchema = z
  .object({
    sendingEnabled: z.boolean().optional(),
    parsingEnabled: z.boolean().optional()
  })
  .refine((body) => body.sendingEnabled !== undefined || body.parsingEnabled !== undefined, {
    message: "At least one flag must be provided"
  });
