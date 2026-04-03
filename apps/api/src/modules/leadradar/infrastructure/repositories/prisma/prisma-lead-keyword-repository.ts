import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../../../../lib/errors.js";
import type { LeadKeywordRepository } from "../lead-keyword-repository.js";
import type {
  CreateLeadKeywordInput,
  CreateNegativeKeywordInput,
  ListAccountScopedInput,
  UpdateLeadKeywordInput,
  UpdateNegativeKeywordInput
} from "../../../types/repository-inputs.js";
import { leadRadarMappers } from "../../mappers.js";

export class PrismaLeadKeywordRepository implements LeadKeywordRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listKeywords(input: ListAccountScopedInput) {
    const rows = await this.prisma.leadRadarKeyword.findMany({
      where: {
        userId: input.user_id,
        telegramAccountId: input.telegram_account_id
      },
      orderBy: [{ isActive: "desc" }, { priority: "desc" }, { updatedAt: "desc" }]
    });
    return rows.map(leadRadarMappers.keyword);
  }

  async addKeyword(input: CreateLeadKeywordInput) {
    const row = await this.prisma.leadRadarKeyword.create({
      data: {
        userId: input.user_id,
        telegramAccountId: input.telegram_account_id,
        keyword: input.keyword,
        matchType: input.match_type as unknown as never,
        category: input.category as unknown as never,
        priority: input.priority ?? 0,
        isActive: input.is_active ?? true
      }
    });
    return leadRadarMappers.keyword(row);
  }

  async updateKeyword(input: UpdateLeadKeywordInput) {
    const existing = await this.prisma.leadRadarKeyword.findFirst({
      where: {
        id: input.id,
        userId: input.user_id,
        telegramAccountId: input.telegram_account_id
      },
      select: { id: true }
    });
    if (!existing) {
      throw new AppError(404, "LEADRADAR_KEYWORD_NOT_FOUND", "Keyword not found");
    }

    const row = await this.prisma.leadRadarKeyword.update({
      where: { id: existing.id },
      data: {
        ...(typeof input.patch.keyword === "string" ? { keyword: input.patch.keyword } : {}),
        ...(input.patch.match_type ? { matchType: input.patch.match_type as unknown as never } : {}),
        ...(input.patch.category ? { category: input.patch.category as unknown as never } : {}),
        ...(typeof input.patch.priority === "number" ? { priority: input.patch.priority } : {}),
        ...(typeof input.patch.is_active === "boolean" ? { isActive: input.patch.is_active } : {})
      }
    });
    return leadRadarMappers.keyword(row);
  }

  async removeKeyword(input: { id: string; user_id: string; telegram_account_id: string }) {
    const existing = await this.prisma.leadRadarKeyword.findFirst({
      where: { id: input.id, userId: input.user_id, telegramAccountId: input.telegram_account_id },
      select: { id: true }
    });
    if (!existing) {
      const byIdOnly = await this.prisma.leadRadarKeyword.findFirst({
        where: { id: input.id },
        select: { id: true, userId: true, telegramAccountId: true }
      });
      if (byIdOnly) {
        throw new AppError(
          403,
          "LEADRADAR_KEYWORD_SCOPE_MISMATCH",
          `Keyword exists but belongs to another scope (expected userId=${input.user_id}, tgAccountId=${input.telegram_account_id}; actual userId=${byIdOnly.userId}, tgAccountId=${byIdOnly.telegramAccountId})`
        );
      }
      throw new AppError(404, "LEADRADAR_KEYWORD_NOT_FOUND", "Keyword not found");
    }
    await this.prisma.leadRadarKeyword.delete({ where: { id: existing.id } });
  }

  async listNegativeKeywords(input: ListAccountScopedInput) {
    const rows = await this.prisma.leadRadarNegativeKeyword.findMany({
      where: {
        userId: input.user_id,
        telegramAccountId: input.telegram_account_id
      },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }]
    });
    return rows.map(leadRadarMappers.negativeKeyword);
  }

  async addNegativeKeyword(input: CreateNegativeKeywordInput) {
    const row = await this.prisma.leadRadarNegativeKeyword.create({
      data: {
        userId: input.user_id,
        telegramAccountId: input.telegram_account_id,
        phrase: input.phrase,
        isActive: input.is_active ?? true
      }
    });
    return leadRadarMappers.negativeKeyword(row);
  }

  async updateNegativeKeyword(input: UpdateNegativeKeywordInput) {
    const existing = await this.prisma.leadRadarNegativeKeyword.findFirst({
      where: {
        id: input.id,
        userId: input.user_id,
        telegramAccountId: input.telegram_account_id
      },
      select: { id: true }
    });
    if (!existing) {
      throw new AppError(404, "LEADRADAR_NEGATIVE_KEYWORD_NOT_FOUND", "Negative keyword not found");
    }

    const row = await this.prisma.leadRadarNegativeKeyword.update({
      where: { id: existing.id },
      data: {
        ...(typeof input.patch.phrase === "string" ? { phrase: input.patch.phrase } : {}),
        ...(typeof input.patch.is_active === "boolean" ? { isActive: input.patch.is_active } : {})
      }
    });
    return leadRadarMappers.negativeKeyword(row);
  }

  async removeNegativeKeyword(input: { id: string; user_id: string; telegram_account_id: string }) {
    const existing = await this.prisma.leadRadarNegativeKeyword.findFirst({
      where: { id: input.id, userId: input.user_id, telegramAccountId: input.telegram_account_id },
      select: { id: true }
    });
    if (!existing) {
      const byIdOnly = await this.prisma.leadRadarNegativeKeyword.findFirst({
        where: { id: input.id },
        select: { id: true, userId: true, telegramAccountId: true }
      });
      if (byIdOnly) {
        throw new AppError(
          403,
          "LEADRADAR_NEGATIVE_KEYWORD_SCOPE_MISMATCH",
          `Negative keyword exists but belongs to another scope (expected userId=${input.user_id}, tgAccountId=${input.telegram_account_id}; actual userId=${byIdOnly.userId}, tgAccountId=${byIdOnly.telegramAccountId})`
        );
      }
      throw new AppError(404, "LEADRADAR_NEGATIVE_KEYWORD_NOT_FOUND", "Negative keyword not found");
    }
    await this.prisma.leadRadarNegativeKeyword.delete({ where: { id: existing.id } });
  }
}

