import { z } from "zod";

export const commentCandidateStatusSchema = z.enum(["new", "published", "ignored"]);

export const listCommentCandidatesQuerySchema = z.object({
  status: commentCandidateStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const commentCandidateIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const updateCommentCandidateBodySchema = z.object({
  aiComment: z.string().trim().min(1).max(10000)
});
