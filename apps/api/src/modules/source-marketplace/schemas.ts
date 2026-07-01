import { z } from "zod";

const topicStatusSchema = z.enum(["draft", "active", "hidden"]);
const entryStatusSchema = z.enum(["active", "paused", "blocked", "review"]);

const slugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9\u0400-\u04FF]+(?:-[a-z0-9\u0400-\u04FF]+)*$/u, "Slug must be lowercase alphanumeric with optional hyphens");

const entryTitleSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().slice(0, 255) : value),
  z.string().min(1).max(255)
);

export const listTopicsQuerySchema = z.object({
  status: topicStatusSchema.optional(),
  search: z.string().max(255).optional()
});

export const topicIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const createTopicBodySchema = z.object({
  name: z.string().min(1).max(255),
  slug: slugSchema,
  description: z.string().max(5000).optional().nullable(),
  icon: z.string().max(64).optional(),
  color: z.string().max(32).optional(),
  status: topicStatusSchema.optional(),
  sortOrder: z.coerce.number().int().min(0).max(100_000).optional()
});

export const updateTopicBodySchema = createTopicBodySchema.partial().refine((obj) => Object.keys(obj).length > 0, {
  message: "At least one field is required"
});

export const listEntriesQuerySchema = z.object({
  status: entryStatusSchema.optional(),
  topicId: z.string().uuid().optional(),
  search: z.string().max(255).optional()
});

export const entryIdParamsSchema = z.object({
  id: z.string().uuid()
});

const entryBodyFieldsSchema = z.object({
  title: entryTitleSchema,
  telegramUsername: z.string().max(128).optional().nullable(),
  telegramChatId: z.string().max(128).optional().nullable(),
  chatType: z.string().max(64).optional().nullable(),
  status: entryStatusSchema.optional(),
  note: z.string().max(10_000).optional().nullable(),
  lastCheckedAt: z.string().datetime().optional().nullable(),
  topicIds: z.array(z.string().uuid()).optional(),
  topic_ids: z.array(z.string().uuid()).optional()
});

const normalizeEntryTopicIds = <T extends { topicIds?: string[]; topic_ids?: string[] }>(body: T) => {
  const { topic_ids, topicIds, ...rest } = body;
  return {
    ...rest,
    topicIds: topicIds ?? topic_ids
  };
};

export const createEntryBodySchema = entryBodyFieldsSchema.transform(normalizeEntryTopicIds);

export const updateEntryBodySchema = entryBodyFieldsSchema
  .partial()
  .transform(normalizeEntryTopicIds)
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field is required"
  });

const chatTopicsQueryPreprocessor = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        // fall through to comma split
      }
    }
    return trimmed.split(",").map((part) => part.trim());
  }
  return [];
}, z.array(z.string().trim().max(80)).max(15));

export const marketplaceRecommendationsQuerySchema = z.object({
  chatTopics: chatTopicsQueryPreprocessor
});

export const startSubscribeBodySchema = z.object({
  topicIds: z.array(z.string().uuid()).min(1).max(50),
  channelAccountId: z.string().uuid()
});

export const subscribeRunIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const resolveCatalogLinkBodySchema = z.object({
  link: z.string().min(1).max(500),
  channelAccountId: z.string().uuid()
});

export const subscribeJoinOutcomeBodySchema = z
  .object({
    runId: z.string().uuid(),
    telegramAccountId: z.string().uuid(),
    entryId: z.string().uuid(),
    status: z.enum(["joined", "private", "invalid"]),
    telegramChatId: z.string().max(128).optional(),
    chatTitle: z.string().max(255).nullable().optional(),
    chatType: z.string().max(64).nullable().optional()
  })
  .superRefine((body, ctx) => {
    if (body.status === "joined" && !body.telegramChatId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "telegramChatId is required when status is joined",
        path: ["telegramChatId"]
      });
    }
  });
