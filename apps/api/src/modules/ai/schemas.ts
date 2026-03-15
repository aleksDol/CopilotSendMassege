import { z } from "zod";

export const suggestReplyModeSchema = z.enum([
  "default",
  "shorter",
  "more_friendly",
  "more_sales",
  "handle_objection"
]);

export const suggestReplyParamsSchema = z.object({
  id: z.string().uuid()
});

export const suggestReplyBodySchema = z.object({
  mode: suggestReplyModeSchema.default("default")
});

export const listSuggestionsParamsSchema = z.object({
  id: z.string().uuid()
});

export const listSuggestionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

export const suggestionActionParamsSchema = z.object({
  id: z.string().uuid()
});
