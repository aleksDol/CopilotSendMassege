import { z } from "zod";
import { LeadMatchType } from "../domain/enums/lead-match-type.js";
import { LeadCategory } from "../domain/enums/lead-category.js";
import { LeadStatus } from "../domain/enums/lead-status.js";

const booleanFromQuery = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return value;
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return value;
}, z.boolean());

export const sourceIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const listSourcesQuerySchema = z.object({
  is_active: booleanFromQuery.optional(),
  search: z.string().max(255).optional()
});

export const createSourceBodySchema = z.object({
  telegramChatId: z.string().min(1).max(128),
  chatTitle: z.string().max(255).optional().nullable(),
  chatType: z.string().max(64).optional().nullable()
});

export const createSourceByLinkBodySchema = z.object({
  link: z.string().min(1).max(1024)
});

export const updateSourceBodySchema = z.object({
  isActive: z.boolean()
});

export const listKeywordsQuerySchema = z.object({
  is_active: booleanFromQuery.optional(),
  category: z.nativeEnum(LeadCategory).optional()
});

export const createKeywordBodySchema = z.object({
  keyword: z.string().min(1).max(255),
  matchType: z.nativeEnum(LeadMatchType),
  category: z.nativeEnum(LeadCategory),
  priority: z.coerce.number().int().min(0).optional()
});

export const updateKeywordBodySchema = z
  .object({
    keyword: z.string().min(1).max(255).optional(),
    matchType: z.nativeEnum(LeadMatchType).optional(),
    category: z.nativeEnum(LeadCategory).optional(),
    priority: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().optional()
  })
  .refine((obj) => Object.keys(obj).length > 0, "Empty patch is not allowed");

export const createNegativeKeywordBodySchema = z.object({
  phrase: z.string().min(1).max(255)
});

export const updateNegativeKeywordBodySchema = z
  .object({
    phrase: z.string().min(1).max(255).optional(),
    isActive: z.boolean().optional()
  })
  .refine((obj) => Object.keys(obj).length > 0, "Empty patch is not allowed");

export const updateSettingsBodySchema = z
  .object({
    isEnabled: z.boolean().optional(),
    minScoreThreshold: z.coerce.number().int().min(0).optional(),
    storeContextEnabled: z.boolean().optional(),
    contextBeforeCount: z.coerce.number().int().min(0).optional(),
    contextAfterCount: z.coerce.number().int().min(0).optional(),
    dedupeWindowHours: z.coerce.number().int().min(1).optional()
  })
  .refine((obj) => Object.keys(obj).length > 0, "Empty patch is not allowed");

export const testIngestionBodySchema = z.object({
  chatId: z.string().min(1).max(128),
  chatTitle: z.string().min(1).max(255),
  text: z.string().min(1).max(10000),
  messageId: z.string().min(1).max(128)
});

const isoDateSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid ISO date")
  .transform((value) => new Date(value));

export const listLeadsQuerySchema = z.object({
  status: z.nativeEnum(LeadStatus).optional(),
  chatId: z.string().min(1).max(128).optional(),
  search: z.string().max(255).optional(),
  date_from: isoDateSchema.optional(),
  date_to: isoDateSchema.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["created_at", "message_date", "score"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional()
});

export const updateLeadStatusBodySchema = z.object({
  status: z.nativeEnum(LeadStatus)
});

export const updateLeadNotesBodySchema = z.object({
  notes: z.string().max(10_000).nullable()
});

export const sendLeadFirstMessageBodySchema = z.object({
  text: z.string().trim().min(1).max(4096)
});

