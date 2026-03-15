import { z } from "zod";

export const conversationParamsSchema = z.object({
  id: z.string().uuid()
});

export const listMessagesQuerySchema = z.object({
  before: z
    .string()
    .optional()
    .refine((value) => (value ? !Number.isNaN(Date.parse(value)) : true), "Invalid before timestamp"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const sendMessageBodySchema = z.object({
  text: z.string().trim().min(1).max(4096)
});
