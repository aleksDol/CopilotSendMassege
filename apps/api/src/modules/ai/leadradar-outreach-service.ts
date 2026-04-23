import { OpenAIProvider, type AIMessage } from "@repo/ai-core";
import type { KnowledgeItem, ReplyPolicy } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { readThroughCache } from "../../lib/cache.js";
import { AppError } from "../../lib/errors.js";
import {
  buildLeadRadarOutreachAnalysisPrompt,
  buildLeadRadarOutreachMessagePrompt,
  LEADRADAR_OUTREACH_ANALYSIS_PROMPT_KEY,
  LEADRADAR_OUTREACH_MESSAGE_PROMPT_KEY,
  type OutreachLeadAnalysis
} from "./leadradar-outreach-prompts.js";

const analysisSchema = z.object({
  leadType: z.enum(["buyer_direct", "service_provider", "business_owner_with_problem", "unclear"]),
  detectedRole: z.string().max(120),
  detectedActivity: z.string().max(80),
  detectedNeedOrPain: z.string().max(220),
  relevantOfferAngle: z.string().max(220),
  productFit: z.boolean(),
  productFitReason: z.string().max(120),
  contactReason: z.string().max(120),
  bestQuestion: z.string().max(160),
  keyTopic: z.string().max(32).nullable(),
  confidence: z.enum(["low", "medium", "high"])
});

const tryParseJson = (raw: string): unknown => {
  const trimmed = raw.trim();
  // Try to strip accidental fences.
  const unfenced = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(unfenced);
};

const SALESY_TRIGGERS = [
  "у меня есть инструмент",
  "у меня есть решение",
  "я могу предложить",
  "ты пробовал ai",
  "ты пробовал ии",
  "могу помочь",
  "оптимизировать процессы",
  "увеличить конверсию"
] as const;

const isSalesyOutreach = (text: string): boolean => {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  return SALESY_TRIGGERS.some((p) => normalized.includes(p));
};

const ASSUMPTION_TRIGGERS_DIRECT = [
  "занимаешься ",
  "вы занимаетесь ",
  "ты занимаешься ",
  "вижу, что",
  "вижу что",
  "заметил, что",
  "заметил что",
  "судя по",
  "возможно,",
  "скорее всего",
  "наверное,"
] as const;

const isAssumptiveForDirect = (text: string): boolean => {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return ASSUMPTION_TRIGGERS_DIRECT.some((p) => t.includes(p));
};

const isTooLong = (text: string): boolean => {
  const t = text.trim();
  if (!t) return false;
  // crude sentence count for RU: split by ., !, ?
  const sentences = t
    .split(/[.!?]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.length > 2;
};

const extractPlaybookRequirements = (playbook: string | null | undefined): {
  requireFree: boolean;
  requireBot: boolean;
  requireTryQuestion: boolean;
} => {
  const p = (playbook ?? "").toLowerCase();
  if (!p.trim()) return { requireFree: false, requireBot: false, requireTryQuestion: false };
  return {
    requireFree: p.includes("бесплат"),
    requireBot: p.includes("бот"),
    requireTryQuestion: p.includes("интерес") && (p.includes("попроб") || p.includes("пробова"))
  };
};

const violatesPlaybook = (params: {
  text: string;
  playbook: string | null | undefined;
  sourceIsDirect: boolean;
  analysisIsLowConfidence: boolean;
}): { violated: boolean; reasons: string[] } => {
  const t = params.text.trim().toLowerCase();
  const reasons: string[] = [];
  if (!t) return { violated: true, reasons: ["empty_text"] };

  const req = extractPlaybookRequirements(params.playbook);

  if (params.sourceIsDirect && params.analysisIsLowConfidence && isAssumptiveForDirect(t)) {
    reasons.push("assumptive_for_direct_low_confidence");
  }

  // If playbook explicitly asks to mention "free", enforce it.
  if (req.requireFree && !t.includes("бесплат")) {
    reasons.push("missing_free");
  }

  // If playbook explicitly asks to say it's a bot, enforce "бот".
  if (req.requireBot && !t.includes("бот")) {
    reasons.push("missing_bot");
  }

  // If playbook asks to end with "интересно попробовать?" enforce try/interest question hint.
  if (req.requireTryQuestion && !(t.includes("интерес") && (t.includes("попроб") || t.includes("пробова")))) {
    reasons.push("missing_try_interest_question");
  }

  return { violated: reasons.length > 0, reasons };
};

const hasChatReason = (text: string): boolean => {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  // lightweight: require a "chat reference" token
  return t.includes("в чате") || t.includes("сообщен");
};

const hasDirectReason = (text: string): boolean => {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  // Ensure we don't accidentally reference chats/groups when this is a DM.
  const hasForbidden = t.includes("в чате") || t.includes("в группе") || t.includes("в канале");
  if (hasForbidden) return false;
  // Neutral reason without chat mention is ok.
  return true;
};

const normalize = (value: string | null | undefined): string => (value ?? "").trim().toLowerCase();

const isDirectSource = (params: { sourceType?: string | null; chatTitle?: string | null }): boolean => {
  const st = normalize(params.sourceType);
  const ct = normalize(params.chatTitle);
  // Manual leads are explicitly created for DM outreach in CRM.
  if (st === "manual") return true;
  // Common values: direct, private, dm, личка (case-insensitive)
  if (st === "direct" || st === "private" || st === "dm" || st.includes("лич")) return true;
  // UI column "ЧАТ" for manual leads is "Личка"
  if (ct.includes("лич")) return true;
  return false;
};

const isChannelOrGroupSource = (params: { sourceType?: string | null; chatTitle?: string | null }): boolean => {
  const st = normalize(params.sourceType);
  const ct = normalize(params.chatTitle);
  if (
    st === "channel_comments" ||
    st.includes("group") ||
    st.includes("channel") ||
    st.includes("comments") ||
    st.includes("чат") ||
    st.includes("групп") ||
    st.includes("канал")
  ) {
    return true;
  }
  // If chatTitle is present and not "Личка", treat as chat-ish context.
  if (ct && !ct.includes("лич")) return true;
  return false;
};

const hasDetectedActivity = (text: string, detectedActivity: string): boolean => {
  const t = text.trim().toLowerCase();
  const activity = (detectedActivity || "").trim().toLowerCase();
  if (!t || !activity) return false;
  // try to match at least one meaningful token from detectedActivity
  const tokens = activity
    .split(/[\s,.;:!?()]+/g)
    .map((x) => x.trim())
    .filter((x) => x.length >= 4);
  if (!tokens.length) return false;
  return tokens.some((tok) => t.includes(tok));
};

export class LeadRadarOutreachService {
  constructor(private readonly app: FastifyInstance) {}

  private readonly COLD_FIRST_TOUCH_POLICY_KEY = "aiBrainColdFirstTouch";

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

  private async loadBrainContext(companyId: string): Promise<{
    knowledgeItems: Array<Pick<KnowledgeItem, "kind" | "title" | "content" | "priority" | "version" | "id">>;
    replyPolicy: Pick<ReplyPolicy, "toneRules" | "pricingRules" | "forbiddenPromises" | "forbiddenTopics"> | null;
  }> {
    const [knowledgeItems, replyPolicy] = await Promise.all([
      readThroughCache(this.app, {
        keyParts: ["cache:knowledge", companyId],
        loader: () =>
          this.app.prisma.knowledgeItem.findMany({
            where: {
              companyId,
              isActive: true
            },
            orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
            take: 20,
            select: {
              id: true,
              kind: true,
              title: true,
              content: true,
              priority: true,
              version: true
            }
          })
      }),
      readThroughCache(this.app, {
        keyParts: ["cache:reply-policy", companyId],
        loader: () =>
          this.app.prisma.replyPolicy.findUnique({
            where: { companyId },
            select: {
              toneRules: true,
              pricingRules: true,
              forbiddenPromises: true,
              forbiddenTopics: true
            }
          })
      })
    ]);

    return { knowledgeItems, replyPolicy };
  }

  private async loadColdFirstTouchPlaybook(params: { telegramAccountId: string }): Promise<string | null> {
    // Use raw SQL to avoid tight coupling to generated Prisma typings during deploys.
    const rows = await this.app.prisma.$queryRaw<Array<{ cold_first_touch_playbook: string | null }>>`
      SELECT cold_first_touch_playbook
      FROM lead_settings
      WHERE telegram_account_id = ${params.telegramAccountId}::uuid
      LIMIT 1
    `;
    return rows?.[0]?.cold_first_touch_playbook ?? null;
  }

  private extractPlaybookFromReplyPolicy(replyPolicy: Pick<ReplyPolicy, "toneRules"> | null): string | null {
    const toneRules = replyPolicy?.toneRules;
    if (toneRules && typeof toneRules === "object" && !Array.isArray(toneRules)) {
      const record = toneRules as Record<string, unknown>;
      const value = record[this.COLD_FIRST_TOUCH_POLICY_KEY];
      if (typeof value === "string" && value.trim().length > 0) return value.trim();
    }
    return null;
  }

  private async completeText(messages: AIMessage[], opts: { temperature: number; maxTokens: number }) {
    const provider = this.getProvider();
    return provider.complete({
      messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens
    });
  }

  async analyzeLeadForOutreach(params: {
    companyId: string;
    userId: string;
    leadId: string;
    leadMessage: string | null;
    leadName?: string | null;
    sourceType?: string | null;
    chatTitle?: string | null;
  }): Promise<OutreachLeadAnalysis> {
    const startedAt = Date.now();
    const { knowledgeItems, replyPolicy } = await this.loadBrainContext(params.companyId);
    const { systemPrompt, userPrompt } = buildLeadRadarOutreachAnalysisPrompt({
      leadMessage: params.leadMessage,
      leadName: params.leadName,
      sourceType: params.sourceType,
      chatTitle: params.chatTitle,
      knowledgeItems,
      replyPolicy
    });

    const run = await this.app.prisma.aiRun.create({
      data: {
        companyId: params.companyId,
        runType: "CLASSIFICATION" as never,
        provider: "openai",
        model: this.app.config.env.OPENAI_MODEL_REPLY,
        status: "RUNNING",
        promptVersion: this.app.config.env.AI_PROMPT_VERSION,
        metadata: {
          promptKey: LEADRADAR_OUTREACH_ANALYSIS_PROMPT_KEY,
          stage: "analysis",
          leadRadarLeadId: params.leadId,
          createdByUserId: params.userId
        }
      }
    });

    try {
      const raw = await this.completeText(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        { temperature: 0.2, maxTokens: 220 }
      );

      let parsed: OutreachLeadAnalysis | null = null;
      try {
        const obj = tryParseJson(raw);
        parsed = analysisSchema.parse(obj);
      } catch {
        // One retry with a stricter instruction.
        const retryRaw = await this.completeText(
          [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content:
                userPrompt +
                "\n\nIMPORTANT: Your previous output was invalid. Return ONLY a valid JSON object with those exact keys, no extra text."
            }
          ],
          { temperature: 0.1, maxTokens: 220 }
        );
        const obj2 = tryParseJson(retryRaw);
        parsed = analysisSchema.parse(obj2);
      }

      await this.app.prisma.aiRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCEEDED",
          latencyMs: Date.now() - startedAt,
          inputTokens: 0,
          outputTokens: 0,
          metadata: {
            ...(run.metadata as any),
            analysis: parsed
          }
        }
      });

      return parsed;
    } catch (error) {
      await this.app.prisma.aiRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          latencyMs: Date.now() - startedAt,
          errorMessage: error instanceof Error ? error.message : "Unknown AI error"
        }
      });
      if (error instanceof AppError) throw error;
      throw new AppError(503, "AI_UNAVAILABLE", "ai_unavailable");
    }
  }

  async generateOutreachMessage(params: {
    companyId: string;
    userId: string;
    leadId: string;
    leadMessage: string | null;
    leadName?: string | null;
    sourceType?: string | null;
    chatTitle?: string | null;
    telegramAccountId?: string | null;
    analysis: OutreachLeadAnalysis;
  }): Promise<{ text: string }> {
    const startedAt = Date.now();
    const { knowledgeItems, replyPolicy } = await this.loadBrainContext(params.companyId);
    // Prefer company-scoped playbook from ReplyPolicy (survives Telegram account changes).
    const coldFirstTouchPlaybook =
      this.extractPlaybookFromReplyPolicy(replyPolicy) ??
      (params.telegramAccountId ? await this.loadColdFirstTouchPlaybook({ telegramAccountId: params.telegramAccountId }) : null);
    const { systemPrompt, userPrompt } = buildLeadRadarOutreachMessagePrompt({
      leadMessage: params.leadMessage,
      leadName: params.leadName,
      sourceType: params.sourceType,
      chatTitle: params.chatTitle,
      coldFirstTouchPlaybook,
      analysis: params.analysis,
      knowledgeItems,
      replyPolicy
    });

    const run = await this.app.prisma.aiRun.create({
      data: {
        companyId: params.companyId,
        runType: "SUGGESTION" as never,
        provider: "openai",
        model: this.app.config.env.OPENAI_MODEL_REPLY,
        status: "RUNNING",
        promptVersion: this.app.config.env.AI_PROMPT_VERSION,
        metadata: {
          promptKey: LEADRADAR_OUTREACH_MESSAGE_PROMPT_KEY,
          stage: "message_generation",
          leadRadarLeadId: params.leadId,
          createdByUserId: params.userId,
          analysis: params.analysis
        }
      }
    });

    try {
      const raw = await this.completeText(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        { temperature: 0.6, maxTokens: 160 }
      );
      let text = (raw ?? "").trim();

      let regenerated = false;
      let warningSalesy = false;
      let warningStructure = false;

      const requiresStructure = Boolean(params.analysis.productFit);
      const sourceIsDirect = isDirectSource({ sourceType: params.sourceType, chatTitle: params.chatTitle });
      const sourceIsChat = isChannelOrGroupSource({ sourceType: params.sourceType, chatTitle: params.chatTitle });
      const reasonOk = sourceIsDirect ? hasDirectReason(text) : sourceIsChat ? hasChatReason(text) : true;
      const detectedActivity = (params.analysis.detectedActivity ?? "").trim();
      const analysisIsLowConfidence = params.analysis.confidence === "low";
      const requiresActivity = !analysisIsLowConfidence && detectedActivity.length > 0 && detectedActivity !== "—";
      const activityOk = !requiresActivity ? true : hasDetectedActivity(text, detectedActivity);
      const structureOk = !requiresStructure ? true : reasonOk && activityOk;

      const playbookCheck = violatesPlaybook({
        text,
        playbook: coldFirstTouchPlaybook,
        sourceIsDirect,
        analysisIsLowConfidence
      });

      const shouldRegenerate =
        isSalesyOutreach(text) ||
        !structureOk ||
        (sourceIsDirect && analysisIsLowConfidence && (isAssumptiveForDirect(text) || isTooLong(text))) ||
        playbookCheck.violated;

      if (shouldRegenerate) {
        regenerated = true;
        this.app.log.info(
          { leadRadarLeadId: params.leadId, outreach_first_message_regenerated: true },
          "outreach_first_message_regenerated"
        );

        const retry = await this.completeText(
          [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content:
                userPrompt +
                "\n\nCRITICAL: Rewrite the message to be non-salesy and follow the required structure. " +
                (sourceIsDirect
                  ? "If productFit=true, do NOT mention chats/groups/channels. "
                  : sourceIsChat
                    ? "If productFit=true, you MUST include a short chat-based reason (mention 'в чате' or 'сообщение') "
                    : "If productFit=true, keep the reason neutral (no chat claims). ") +
                (analysisIsLowConfidence || !requiresActivity
                  ? "Do NOT guess what the person does. Follow the provided cold-first-touch playbook if present. " +
                    "Use 1 short value hook + 1 short key plus from AI Brain, then ONE qualifying question (two options if possible). " +
                    "Keep it to 1–2 sentences. "
                  : "Include detectedActivity (use its key words). ") +
                (playbookCheck.violated
                  ? `Playbook compliance failed: ${playbookCheck.reasons.join(", ")}. Fix it. `
                  : "") +
                "Do NOT mention product/tool/solution. No 'могу помочь'. No AI mention. Keep 1–2 short sentences and exactly ONE question."
            }
          ],
          { temperature: 0.4, maxTokens: 160 }
        );
        text = (retry ?? "").trim();

        if (isSalesyOutreach(text)) {
          warningSalesy = true;
          this.app.log.warn(
            { leadRadarLeadId: params.leadId, outreach_first_message_warning_salesy: true },
            "outreach_first_message_warning_salesy"
          );
        }

        const reasonOkAfter = sourceIsDirect ? hasDirectReason(text) : sourceIsChat ? hasChatReason(text) : true;
        const activityOkAfter = !requiresActivity ? true : hasDetectedActivity(text, detectedActivity);
        const structureOkAfter = !requiresStructure ? true : reasonOkAfter && activityOkAfter;
        if (!structureOkAfter) {
          warningStructure = true;
          this.app.log.warn(
            { leadRadarLeadId: params.leadId, outreach_first_message_warning_structure: true },
            "outreach_first_message_warning_structure"
          );
        }
      } else {
        this.app.log.info(
          { leadRadarLeadId: params.leadId, outreach_first_message_regenerated: false },
          "outreach_first_message_regenerated"
        );
      }

      await this.app.prisma.aiRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCEEDED",
          latencyMs: Date.now() - startedAt,
          inputTokens: 0,
          outputTokens: 0,
          metadata: {
            ...(run.metadata as any),
            outputChars: text.length,
            outreach_first_message_regenerated: regenerated,
            outreach_first_message_warning_salesy: warningSalesy,
            outreach_first_message_warning_structure: warningStructure
          }
        }
      });

      if (!text) {
        throw new AppError(503, "AI_UNAVAILABLE", "ai_unavailable");
      }

      return { text };
    } catch (error) {
      await this.app.prisma.aiRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          latencyMs: Date.now() - startedAt,
          errorMessage: error instanceof Error ? error.message : "Unknown AI error"
        }
      });
      if (error instanceof AppError) throw error;
      throw new AppError(503, "AI_UNAVAILABLE", "ai_unavailable");
    }
  }

  async generate(params: {
    companyId: string;
    userId: string;
    leadId: string;
    leadMessage: string | null;
    leadName?: string | null;
    sourceType?: string | null;
    chatTitle?: string | null;
    telegramAccountId?: string | null;
  }): Promise<{ text: string; analysis: OutreachLeadAnalysis }> {
    const analysis = await this.analyzeLeadForOutreach(params);
    const msg = await this.generateOutreachMessage({ ...params, analysis });
    return { ...msg, analysis };
  }
}

