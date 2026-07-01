import { OpenAIProvider, type AIMessage } from "@repo/ai-core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import {
  buildLeadRadarAiSetupPrompt,
  LEADRADAR_AI_SETUP_KEYWORD_GROUP_TITLES
} from "./leadradar-ai-setup-prompts.js";

const tryParseJson = (raw: string): unknown => {
  const trimmed = raw.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(unfenced);
};

const dedupeTrimmedStrings = (items: string[], maxItemLength: number, seen?: Set<string>): string[] => {
  const globalSeen = seen ?? new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const clipped = trimmed.slice(0, maxItemLength);
    const key = clipped.toLowerCase();
    if (globalSeen.has(key)) continue;
    globalSeen.add(key);
    out.push(clipped);
  }
  return out;
};

const normalizeGroupTitle = (title: string): string => title.trim().toLowerCase();

export const leadRadarAiSetupKeywordGroupSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(300),
  keywords: z.array(z.string().trim().min(2).max(120)).max(15)
});

export const leadRadarAiSetupResultSchema = z
  .object({
    niche: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(500),
    keywordGroups: z.array(leadRadarAiSetupKeywordGroupSchema).length(LEADRADAR_AI_SETUP_KEYWORD_GROUP_TITLES.length),
    negativeKeywords: z.array(z.string().trim().min(2).max(120)).max(20),
    chatTopics: z.array(z.string().trim().min(2).max(80)).min(1).max(15)
  })
  .superRefine((value, ctx) => {
    const totalKeywords = value.keywordGroups.reduce((sum, group) => sum + group.keywords.length, 0);
    if (totalKeywords < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one keyword is required across all groups",
        path: ["keywordGroups"]
      });
    }
  });

export type LeadRadarAiSetupResult = z.infer<typeof leadRadarAiSetupResultSchema>;

const llmKeywordGroupSchema = z.object({
  title: z.string(),
  description: z.string().optional().default(""),
  keywords: z.array(z.string()).optional().default([])
});

const llmPayloadSchema = z.object({
  niche: z.string(),
  summary: z.string().optional().default(""),
  keywordGroups: z.array(llmKeywordGroupSchema).optional().default([]),
  negativeKeywords: z.array(z.string()).optional().default([]),
  chatTopics: z.array(z.string())
});

export const normalizeLeadRadarAiSetupResult = (payload: unknown): LeadRadarAiSetupResult => {
  const parsed = llmPayloadSchema.parse(payload);
  const incomingByTitle = new Map<string, { description: string; keywords: string[] }>();

  for (const group of parsed.keywordGroups) {
    const titleKey = normalizeGroupTitle(group.title);
    if (!titleKey) continue;
    const existing = incomingByTitle.get(titleKey);
    const keywords = [...(existing?.keywords ?? []), ...(group.keywords ?? [])];
    const description = (group.description ?? existing?.description ?? "").trim();
    incomingByTitle.set(titleKey, { description, keywords });
  }

  const globalSeen = new Set<string>();
  const keywordGroups = LEADRADAR_AI_SETUP_KEYWORD_GROUP_TITLES.map((canonicalTitle) => {
    const incoming = incomingByTitle.get(normalizeGroupTitle(canonicalTitle));
    const keywords = dedupeTrimmedStrings(incoming?.keywords ?? [], 120, globalSeen);
    const description =
      (incoming?.description ?? "").trim() ||
      `Фразы категории «${canonicalTitle}» для поиска потенциальных клиентов в Telegram.`;

    return {
      title: canonicalTitle,
      description: description.slice(0, 300),
      keywords
    };
  });

  const summary =
    parsed.summary.trim() ||
    `Подобраны buyer-intent фразы для ниши «${parsed.niche.trim()}» — ${keywordGroups.reduce((n, g) => n + g.keywords.length, 0)} фраз в ${keywordGroups.filter((g) => g.keywords.length).length} группах.`;

  return leadRadarAiSetupResultSchema.parse({
    niche: parsed.niche.trim(),
    summary: summary.slice(0, 500),
    keywordGroups,
    negativeKeywords: dedupeTrimmedStrings(parsed.negativeKeywords ?? [], 120),
    chatTopics: dedupeTrimmedStrings(parsed.chatTopics, 80)
  });
};

export class LeadRadarAiSetupService {
  constructor(private readonly app: FastifyInstance) {}

  private getProvider(): OpenAIProvider {
    if (!this.app.config.env.OPENAI_API_KEY) {
      throw new AppError(503, "AI_UNAVAILABLE", "ai_unavailable");
    }

    return new OpenAIProvider({
      apiKey: this.app.config.env.OPENAI_API_KEY,
      model: this.app.config.env.OPENAI_MODEL_REPLY,
      baseUrl: this.app.config.env.OPENAI_BASE_URL,
      timeoutMs: this.app.config.env.AI_REQUEST_TIMEOUT_MS
    });
  }

  private async completeText(messages: AIMessage[], opts: { temperature: number; maxTokens: number }) {
    const provider = this.getProvider();
    return provider.complete({
      messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens
    });
  }

  async generate(params: { description: string }): Promise<LeadRadarAiSetupResult> {
    const { systemPrompt, userPrompt } = buildLeadRadarAiSetupPrompt({
      description: params.description
    });

    const messages: AIMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const retryHint =
      "IMPORTANT: Your previous output was invalid. Return ONLY valid JSON with keys niche, summary, keywordGroups (exactly 5 groups with exact titles), negativeKeywords, chatTopics. No extra text.";

    try {
      const raw = await this.completeText(messages, { temperature: 0.35, maxTokens: 1400 });
      return normalizeLeadRadarAiSetupResult(tryParseJson(raw));
    } catch (firstError) {
      this.app.log.warn({ err: firstError }, "[LeadRadar AI Setup] first generation attempt failed, retrying");
    }

    try {
      const retryRaw = await this.completeText(
        [...messages, { role: "user", content: retryHint }],
        { temperature: 0.15, maxTokens: 1400 }
      );
      return normalizeLeadRadarAiSetupResult(tryParseJson(retryRaw));
    } catch (retryError) {
      this.app.log.error({ err: retryError }, "[LeadRadar AI Setup] generation failed after retry");
      throw new AppError(502, "AI_SETUP_GENERATION_FAILED", "Failed to generate AI setup preview");
    }
  }
}
