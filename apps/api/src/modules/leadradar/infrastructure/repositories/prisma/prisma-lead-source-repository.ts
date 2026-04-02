import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../../../../lib/errors.js";
import type { LeadSourceRepository } from "../lead-source-repository.js";
import type {
  CreateLeadSourceInput,
  FindSourceByTelegramChatIdInput,
  ListAccountScopedInput,
  UpdateLeadSourceInput
} from "../../../types/repository-inputs.js";
import { leadRadarMappers } from "../../mappers.js";

export class PrismaLeadSourceRepository implements LeadSourceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listSources(input: ListAccountScopedInput) {
    const rows = await this.prisma.leadRadarSource.findMany({
      where: {
        userId: input.user_id,
        telegramAccountId: input.telegram_account_id
      },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }]
    });
    return rows.map(leadRadarMappers.source);
  }

  async addSource(input: CreateLeadSourceInput) {
    // We intentionally use upsert on the unique (telegramAccountId, telegramChatId).
    // This avoids throwing on duplicates and makes repeated "add" idempotent.
    const row = await this.prisma.leadRadarSource.upsert({
      where: {
        telegramAccountId_telegramChatId: {
          telegramAccountId: input.telegram_account_id,
          telegramChatId: input.telegram_chat_id
        }
      },
      update: {
        // Enforce account scope; do not allow cross-user reuse of the same unique record.
        ...(input.user_id ? { userId: input.user_id } : {}),
        chatTitle: input.chat_title ?? null,
        chatType: input.chat_type ?? null,
        isActive: input.is_active ?? true
      },
      create: {
        userId: input.user_id,
        telegramAccountId: input.telegram_account_id,
        telegramChatId: input.telegram_chat_id,
        chatTitle: input.chat_title ?? null,
        chatType: input.chat_type ?? null,
        isActive: input.is_active ?? true
      }
    });

    // Safety: ensure the resulting row belongs to the requested scope.
    if (row.userId !== input.user_id || row.telegramAccountId !== input.telegram_account_id) {
      throw new AppError(409, "LEADRADAR_SOURCE_SCOPE_CONFLICT", "Lead source exists for another account scope");
    }

    return leadRadarMappers.source(row);
  }

  async updateSource(input: UpdateLeadSourceInput) {
    const existing = await this.prisma.leadRadarSource.findFirst({
      where: {
        id: input.id,
        userId: input.user_id,
        telegramAccountId: input.telegram_account_id
      }
    });
    if (!existing) {
      throw new AppError(404, "LEADRADAR_SOURCE_NOT_FOUND", "Lead source not found");
    }

    const row = await this.prisma.leadRadarSource.update({
      where: { id: existing.id },
      data: {
        ...(typeof input.patch.telegram_chat_id === "string" ? { telegramChatId: input.patch.telegram_chat_id } : {}),
        ...(Object.prototype.hasOwnProperty.call(input.patch, "chat_title") ? { chatTitle: input.patch.chat_title ?? null } : {}),
        ...(Object.prototype.hasOwnProperty.call(input.patch, "chat_type") ? { chatType: input.patch.chat_type ?? null } : {}),
        ...(typeof input.patch.is_active === "boolean" ? { isActive: input.patch.is_active } : {})
      }
    });
    return leadRadarMappers.source(row);
  }

  async removeSource(input: { id: string; user_id: string; telegram_account_id: string }) {
    const existing = await this.prisma.leadRadarSource.findFirst({
      where: {
        id: input.id,
        userId: input.user_id,
        telegramAccountId: input.telegram_account_id
      },
      select: { id: true }
    });
    if (!existing) return;
    await this.prisma.leadRadarSource.delete({ where: { id: existing.id } });
  }

  async findByTelegramChatId(input: FindSourceByTelegramChatIdInput) {
    const row = await this.prisma.leadRadarSource.findFirst({
      where: {
        userId: input.user_id,
        telegramAccountId: input.telegram_account_id,
        telegramChatId: input.telegram_chat_id
      }
    });
    return row ? leadRadarMappers.source(row) : null;
  }
}

