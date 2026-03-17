import {
  OpenAIProvider,
  type GenerateReplyResult,
  type LLMProvider,
  type ReplySuggestionMode
} from "@repo/ai-core";
import { ChannelAccountStatus, Prisma, SuggestionStatus, SuggestionType, UsageMetricType } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { invalidateCacheByPrefix } from "../../lib/cache.js";
import { AppError } from "../../lib/errors.js";
import { BillingService } from "../billing/service.js";
import { AIContextService } from "./context-service.js";
import { PromptAssemblyService } from "./prompt-assembly-service.js";

const mapModeToDb = (mode: ReplySuggestionMode) => {
  switch (mode) {
    case "default":
      return "DEFAULT" as const;
    case "shorter":
      return "SHORTER" as const;
    case "more_friendly":
      return "MORE_FRIENDLY" as const;
    case "more_sales":
      return "MORE_SALES" as const;
    case "handle_objection":
      return "HANDLE_OBJECTION" as const;
  }
};

const toPublicSuggestion = (suggestion: {
  id: string;
  suggestionText: string;
  mode: string;
  status: string;
  confidence: Prisma.Decimal | null;
  createdAt: Date;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  model: string | null;
}) => ({
  id: suggestion.id,
  text: suggestion.suggestionText,
  type: "reply",
  mode: suggestion.mode.toLowerCase(),
  status: suggestion.status.toLowerCase(),
  confidence: suggestion.confidence ? Number(suggestion.confidence) : null,
  createdAt: suggestion.createdAt,
  acceptedAt: suggestion.acceptedAt,
  rejectedAt: suggestion.rejectedAt,
  model: suggestion.model
});

const estimateCostUsd = (model: string, inputTokens = 0, outputTokens = 0): number | null => {
  const normalized = model.toLowerCase();

  const pricing: Record<string, { inputPer1m: number; outputPer1m: number }> = {
    "gpt-4o-mini": { inputPer1m: 0.15, outputPer1m: 0.6 },
    "gpt-4.1-mini": { inputPer1m: 0.4, outputPer1m: 1.6 }
  };

  const matched = Object.entries(pricing).find(([name]) => normalized.includes(name));
  if (!matched) {
    return null;
  }

  const { inputPer1m, outputPer1m } = matched[1];
  return Number(((inputTokens / 1_000_000) * inputPer1m + (outputTokens / 1_000_000) * outputPer1m).toFixed(6));
};

export class ReplySuggestionService {
  private readonly contextService: AIContextService;
  private readonly promptAssemblyService: PromptAssemblyService;
  private readonly billingService: BillingService;

  constructor(private readonly app: FastifyInstance) {
    this.contextService = new AIContextService(app);
    this.promptAssemblyService = new PromptAssemblyService();
    this.billingService = new BillingService(app);
  }

  private getProvider(): LLMProvider {
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

  async suggestReply(params: {
    companyId: string;
    userId: string;
    conversationId: string;
    mode: ReplySuggestionMode;
  }) {
    const startedAt = Date.now();
    const context = await this.contextService.build({
      companyId: params.companyId,
      conversationId: params.conversationId
    });

    const { systemPrompt, promptHash } = this.promptAssemblyService.build({
      mode: params.mode,
      promptVersion: this.app.config.env.AI_PROMPT_VERSION,
      context
    });

    const triggerMessageId = context.triggerMessageId;

    const reusable = await this.app.prisma.aiSuggestion.findFirst({
      where: {
        companyId: params.companyId,
        conversationId: params.conversationId,
        triggerMessageId,
        suggestionType: SuggestionType.REPLY,
        mode: mapModeToDb(params.mode),
        promptHash,
        status: {
          in: [SuggestionStatus.PENDING, SuggestionStatus.ACCEPTED]
        }
      },
      orderBy: { createdAt: "desc" }
    });

    if (reusable) {
      this.app.log.info(
        {
          companyId: params.companyId,
          conversationId: params.conversationId,
          promptHash,
          mode: params.mode,
          reused: true,
          durationMs: Date.now() - startedAt
        },
        "AI suggestion reused from cache"
      );

      return {
        suggestion: toPublicSuggestion(reusable),
        context: {
          leadStage: context.state?.leadStage?.toLowerCase() ?? null,
          leadTemperature: context.state?.leadTemperature?.toLowerCase() ?? null,
          lastClientIntent: context.state?.lastClientIntent ?? null
        },
        reused: true
      };
    }

    const usage = await this.billingService.enforceAiLimit(params.companyId);

    const run = await this.app.prisma.aiRun.create({
      data: {
        companyId: params.companyId,
        conversationId: params.conversationId,
        messageId: triggerMessageId,
        runType: "REPLY_GENERATION" as never,
        provider: "openai",
        model: this.app.config.env.OPENAI_MODEL_REPLY,
        status: "RUNNING",
        promptVersion: this.app.config.env.AI_PROMPT_VERSION,
        metadata: {
          mode: params.mode,
          promptHash
        }
      }
    });

    let providerResult: GenerateReplyResult | null = null;

    try {
      const provider = this.getProvider();
      providerResult = await provider.generateReply({
        mode: params.mode,
        systemPrompt,
        messages: context.recentMessages,
        temperature: 0.5,
        maxTokens: 220
      });

      const inputTokens = providerResult.metadata.inputTokens ?? 0;
      const outputTokens = providerResult.metadata.outputTokens ?? 0;
      const costUsd = estimateCostUsd(providerResult.metadata.model, inputTokens, outputTokens);

      const suggestion = await this.app.prisma.aiSuggestion.create({
        data: {
          companyId: params.companyId,
          conversationId: params.conversationId,
          triggerMessageId,
          suggestionType: SuggestionType.REPLY,
          mode: mapModeToDb(params.mode),
          status: SuggestionStatus.PENDING,
          model: providerResult.metadata.model,
          promptHash,
          inputContext: {
            mode: params.mode,
            promptVersion: this.app.config.env.AI_PROMPT_VERSION,
            recentMessagesCount: context.recentMessages.length,
            knowledgeItemsCount: context.knowledgeItems.length,
            hasSummary: Boolean(context.latestSummary),
            knowledgeVersion: context.knowledgeVersion,
            replyPolicyVersion: context.replyPolicyVersion,
            state: context.state
              ? {
                  leadStage: context.state.leadStage,
                  leadTemperature: context.state.leadTemperature,
                  lastClientIntent: context.state.lastClientIntent,
                  nextRecommendedAction: context.state.nextRecommendedAction,
                  isWaitingForReply: context.state.isWaitingForReply
                }
              : null
          },
          suggestionText: providerResult.text,
          confidence:
            typeof providerResult.confidence === "number"
              ? new Prisma.Decimal(Math.max(0, Math.min(1, providerResult.confidence)))
              : null,
          createdForUserId: params.userId
        }
      });

      await this.app.prisma.aiRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCEEDED",
          inputTokens,
          outputTokens,
          latencyMs: providerResult.metadata.latencyMs,
          costUsd: costUsd !== null ? new Prisma.Decimal(costUsd) : undefined,
          metadata: {
            mode: params.mode,
            promptHash,
            finishReason: providerResult.metadata.finishReason
          }
        }
      });

      await invalidateCacheByPrefix(this.app, `cache:dashboard:${params.companyId}:`);
      const usagePeriodStart = new Date(usage.periodStart);
      const usagePeriodEnd = new Date(usage.periodEnd);
      await this.billingService.recordUsage(params.companyId, UsageMetricType.AI_SUGGESTION, 1, usagePeriodStart, usagePeriodEnd);
      await this.billingService.recordUsage(
        params.companyId,
        UsageMetricType.AI_TOKEN_INPUT,
        inputTokens,
        usagePeriodStart,
        usagePeriodEnd
      );
      await this.billingService.recordUsage(
        params.companyId,
        UsageMetricType.AI_TOKEN_OUTPUT,
        outputTokens,
        usagePeriodStart,
        usagePeriodEnd
      );

      this.app.log.info(
        {
          companyId: params.companyId,
          conversationId: params.conversationId,
          model: providerResult.metadata.model,
          provider: providerResult.metadata.provider,
          durationMs: providerResult.metadata.latencyMs,
          inputTokens,
          outputTokens,
          costUsd,
          mode: params.mode
        },
        "AI suggestion generated"
      );

      if ((providerResult.metadata.latencyMs ?? 0) > 2000) {
        this.app.log.warn(
          {
            companyId: params.companyId,
            conversationId: params.conversationId,
            durationMs: providerResult.metadata.latencyMs
          },
          "Slow AI generation"
        );
      }

      return {
        suggestion: toPublicSuggestion(suggestion),
        context: {
          leadStage: context.state?.leadStage?.toLowerCase() ?? null,
          leadTemperature: context.state?.leadTemperature?.toLowerCase() ?? null,
          lastClientIntent: context.state?.lastClientIntent ?? null
        },
        reused: false
      };
    } catch (error) {
      await this.app.prisma.aiRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          inputTokens: providerResult?.metadata.inputTokens ?? 0,
          outputTokens: providerResult?.metadata.outputTokens ?? 0,
          latencyMs: providerResult?.metadata.latencyMs,
          errorMessage: error instanceof Error ? error.message : "Unknown AI error"
        }
      });

      this.app.log.error(
        {
          companyId: params.companyId,
          conversationId: params.conversationId,
          mode: params.mode,
          err: error
        },
        "AI suggestion failed"
      );

      throw new AppError(503, "AI_UNAVAILABLE", "ai_unavailable");
    }
  }

  async listSuggestions(params: { companyId: string; conversationId: string; limit: number }) {
    const conversation = await this.app.prisma.conversation.findFirst({
      where: {
        id: params.conversationId,
        companyId: params.companyId,
        channelAccount: { status: { not: ChannelAccountStatus.DISCONNECTED } }
      },
      select: { id: true }
    });

    if (!conversation) {
      throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
    }

    const items = await this.app.prisma.aiSuggestion.findMany({
      where: {
        companyId: params.companyId,
        conversationId: params.conversationId,
        suggestionType: SuggestionType.REPLY
      },
      orderBy: { createdAt: "desc" },
      take: params.limit
    });

    return {
      items: items.map(toPublicSuggestion)
    };
  }

  async acceptSuggestion(params: { companyId: string; suggestionId: string }) {
    const suggestion = await this.app.prisma.aiSuggestion.findFirst({
      where: {
        id: params.suggestionId,
        companyId: params.companyId,
        suggestionType: SuggestionType.REPLY
      }
    });

    if (!suggestion) {
      throw new AppError(404, "SUGGESTION_NOT_FOUND", "Suggestion not found");
    }

    const updated = await this.app.prisma.aiSuggestion.update({
      where: { id: suggestion.id },
      data: {
        status: SuggestionStatus.ACCEPTED,
        acceptedAt: new Date(),
        rejectedAt: null
      }
    });

    await invalidateCacheByPrefix(this.app, `cache:dashboard:${params.companyId}:`);

    return {
      suggestion: toPublicSuggestion(updated)
    };
  }

  async rejectSuggestion(params: { companyId: string; suggestionId: string }) {
    const suggestion = await this.app.prisma.aiSuggestion.findFirst({
      where: {
        id: params.suggestionId,
        companyId: params.companyId,
        suggestionType: SuggestionType.REPLY
      }
    });

    if (!suggestion) {
      throw new AppError(404, "SUGGESTION_NOT_FOUND", "Suggestion not found");
    }

    const updated = await this.app.prisma.aiSuggestion.update({
      where: { id: suggestion.id },
      data: {
        status: SuggestionStatus.REJECTED,
        rejectedAt: new Date(),
        acceptedAt: null
      }
    });

    return {
      suggestion: toPublicSuggestion(updated)
    };
  }
}
