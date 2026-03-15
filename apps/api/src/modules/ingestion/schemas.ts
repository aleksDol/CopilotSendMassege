import { z } from "zod";

const isoDateSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid ISO date");

export const ingestionMessageSchema = z.object({
  telegramAccountId: z.string().uuid(),
  externalConversationId: z.string().min(1).max(128),
  externalMessageId: z.string().min(1).max(128),
  senderExternalId: z.string().min(1).max(128),
  senderType: z.enum(["user", "self", "system"]).default("user"),
  senderFullName: z.string().min(1).max(120).optional(),
  senderUsername: z.string().min(1).max(120).optional(),
  text: z.string().max(10000).nullable().optional(),
  sentAt: isoDateSchema,
  isOutgoing: z.boolean(),
  replyToExternalMessageId: z.string().min(1).max(128).nullable().optional(),
  rawPayload: z.record(z.string(), z.unknown()).optional(),
  conversationTitle: z.string().max(255).nullable().optional(),
  hasAttachment: z.boolean().optional().default(false)
});
