import { z } from "zod";

export const commentCandidateStatusSchema = z.enum(["new", "published", "ignored"]);

export const listCommentCandidatesQuerySchema = z.object({
  status: commentCandidateStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  onlyNew: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => (v === undefined ? false : v === "true"))
});

export const commentCandidateIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const channelIdParamSchema = z.object({
  channelId: z.string().trim().min(1).max(64)
});

export const updateCommentCandidateBodySchema = z.object({
  aiComment: z.string().trim().min(1).max(10000)
});

export const upsertCommentingStateBodySchema = z.object({
  lastSeenAt: z.coerce.date().optional()
});

export const addChannelExclusionBodySchema = z.object({
  channelId: z.string().trim().min(1).max(64)
});
