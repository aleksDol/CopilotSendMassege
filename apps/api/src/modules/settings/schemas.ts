import { z } from "zod";

const knowledgeKindSchema = z.enum([
  "faq",
  "product",
  "product_description",
  "policy",
  "pricing_rules",
  "sales_script",
  "objection_handling",
  "tone_of_voice",
  "script",
  "case",
  "other"
]);

export const createKnowledgeBodySchema = z.object({
  kind: knowledgeKindSchema.default("faq"),
  title: z.string().trim().min(1).max(255),
  content: z.string().trim().min(1).max(10000),
  priority: z.coerce.number().int().min(0).max(1000).default(50),
  isActive: z.boolean().default(true)
});

export const patchKnowledgeBodySchema = z
  .object({
    kind: knowledgeKindSchema.optional(),
    title: z.string().trim().min(1).max(255).optional(),
    content: z.string().trim().min(1).max(10000).optional(),
    priority: z.coerce.number().int().min(0).max(1000).optional(),
    isActive: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const knowledgeIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const saveReplyPolicySchema = z.object({
  toneRules: z.unknown().optional(),
  pricingRules: z.unknown().optional(),
  discountRules: z.unknown().optional(),
  forbiddenPromises: z.unknown().optional(),
  forbiddenTopics: z.unknown().optional(),
  humanHandoffRules: z.unknown().optional()
});
