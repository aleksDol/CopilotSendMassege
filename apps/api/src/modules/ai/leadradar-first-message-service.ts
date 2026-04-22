import { OpenAIProvider } from "@repo/ai-core";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { buildLeadRadarFirstMessagePrompt, LEADRADAR_FIRST_MESSAGE_PROMPT_KEY } from "./leadradar-first-message-prompt.js";

export class LeadRadarFirstMessageService {
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

  async generate(params: {
    companyId: string;
    userId: string;
    leadId: string;
    leadMessage: string | null;
    leadName?: string | null;
  }): Promise<{ text: string }> {
    const startedAt = Date.now();
    const { systemPrompt, userPrompt } = buildLeadRadarFirstMessagePrompt({
      leadMessage: params.leadMessage,
      leadName: params.leadName
    });

    // We log via AiRun to match existing AI observability (no new schema/migrations).
    const run = await this.app.prisma.aiRun.create({
      data: {
        companyId: params.companyId,
        runType: "SUGGESTION" as never,
        provider: "openai",
        model: this.app.config.env.OPENAI_MODEL_REPLY,
        status: "RUNNING",
        promptVersion: this.app.config.env.AI_PROMPT_VERSION,
        metadata: {
          promptKey: LEADRADAR_FIRST_MESSAGE_PROMPT_KEY,
          leadRadarLeadId: params.leadId,
          createdByUserId: params.userId
        }
      }
    });

    let text = "";
    try {
      const provider = this.getProvider();
      text = await provider.complete({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.6,
        maxTokens: 140
      });

      const normalized = (text ?? "").trim();
      await this.app.prisma.aiRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCEEDED",
          latencyMs: Date.now() - startedAt,
          // Tokens are unknown with `.complete()` in ai-core today; keep 0.
          inputTokens: 0,
          outputTokens: 0,
          metadata: {
            ...(run.metadata as any),
            outputChars: normalized.length
          }
        }
      });

      if (!normalized) {
        throw new AppError(503, "AI_UNAVAILABLE", "ai_unavailable");
      }

      return { text: normalized };
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
}

