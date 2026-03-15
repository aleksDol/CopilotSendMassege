import type { FastifyInstance } from "fastify";

const startOfDayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const startOfMonthUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

export class UsageMetricsService {
  constructor(private readonly app: FastifyInstance) {}

  private async aggregate(companyId: string, from: Date) {
    const [runAgg, suggestionsGenerated, suggestionsAccepted] = await Promise.all([
      this.app.prisma.aiRun.aggregate({
        where: {
          companyId,
          createdAt: { gte: from }
        },
        _count: { _all: true },
        _sum: {
          inputTokens: true,
          outputTokens: true,
          costUsd: true
        }
      }),
      this.app.prisma.aiSuggestion.count({
        where: {
          companyId,
          createdAt: { gte: from }
        }
      }),
      this.app.prisma.aiSuggestion.count({
        where: {
          companyId,
          acceptedAt: { gte: from }
        }
      })
    ]);

    return {
      totalAiCalls: runAgg._count._all,
      totalTokens: (runAgg._sum.inputTokens ?? 0) + (runAgg._sum.outputTokens ?? 0),
      totalCostUsd: runAgg._sum.costUsd ? Number(runAgg._sum.costUsd) : 0,
      suggestionsGenerated,
      suggestionsAccepted
    };
  }

  async getCompanyUsageToday(companyId: string) {
    return this.aggregate(companyId, startOfDayUtc());
  }

  async getCompanyUsageThisMonth(companyId: string) {
    return this.aggregate(companyId, startOfMonthUtc());
  }

  async getOverview(companyId: string) {
    const [today, month] = await Promise.all([
      this.getCompanyUsageToday(companyId),
      this.getCompanyUsageThisMonth(companyId)
    ]);

    return {
      todayAiCalls: today.totalAiCalls,
      todayTokens: today.totalTokens,
      todayCostUsd: Number(today.totalCostUsd.toFixed(6)),
      monthAiCalls: month.totalAiCalls,
      monthCostUsd: Number(month.totalCostUsd.toFixed(6))
    };
  }

  async logSlowQuery(context: string, startedAt: number) {
    const durationMs = Date.now() - startedAt;
    if (durationMs > 250) {
      this.app.log.warn({ context, durationMs }, "Slow DB query detected");
    }
  }
}

