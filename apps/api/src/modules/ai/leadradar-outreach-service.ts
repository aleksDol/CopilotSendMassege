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
  detectedNeedOrPain: z.string().max(220),
  relevantOfferAngle: z.string().max(220),
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

export class LeadRadarOutreachService {
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
  }): Promise<OutreachLeadAnalysis> {
    const startedAt = Date.now();
    const { knowledgeItems, replyPolicy } = await this.loadBrainContext(params.companyId);
    const { systemPrompt, userPrompt } = buildLeadRadarOutreachAnalysisPrompt({
      leadMessage: params.leadMessage,
      leadName: params.leadName,
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
    analysis: OutreachLeadAnalysis;
  }): Promise<{ text: string }> {
    const startedAt = Date.now();
    const { knowledgeItems, replyPolicy } = await this.loadBrainContext(params.companyId);
    const { systemPrompt, userPrompt } = buildLeadRadarOutreachMessagePrompt({
      leadMessage: params.leadMessage,
      leadName: params.leadName,
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
      const text = (raw ?? "").trim();

      await this.app.prisma.aiRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCEEDED",
          latencyMs: Date.now() - startedAt,
          inputTokens: 0,
          outputTokens: 0,
          metadata: {
            ...(run.metadata as any),
            outputChars: text.length
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
  }): Promise<{ text: string; analysis: OutreachLeadAnalysis }> {
    const analysis = await this.analyzeLeadForOutreach(params);
    const msg = await this.generateOutreachMessage({ ...params, analysis });
    return { ...msg, analysis };
  }
}

