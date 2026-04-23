import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../../../../lib/errors.js";
import type { LeadSettingsRepository } from "../lead-settings-repository.js";
import type { ListAccountScopedInput, UpdateLeadSettingsInput } from "../../../types/repository-inputs.js";
import { leadRadarMappers } from "../../mappers.js";

const DEFAULTS = {
  is_enabled: false,
  min_score_threshold: 2,
  store_context_enabled: true,
  context_before_count: 3,
  context_after_count: 0,
  dedupe_window_hours: 72,
  cold_first_touch_playbook: null as string | null
} as const;

export class PrismaLeadSettingsRepository implements LeadSettingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getSettings(input: ListAccountScopedInput) {
    const row = await this.prisma.leadRadarSettings.findFirst({
      where: {
        userId: input.user_id,
        telegramAccountId: input.telegram_account_id
      }
    });
    return row ? leadRadarMappers.settings(row) : null;
  }

  async createDefaultIfNotExists(input: ListAccountScopedInput) {
    // Idempotent by unique(telegramAccountId). Also enforce user scope.
    const row = await this.prisma.leadRadarSettings.upsert({
      where: { telegramAccountId: input.telegram_account_id },
      update: {},
      create: {
        userId: input.user_id,
        telegramAccountId: input.telegram_account_id,
        isEnabled: DEFAULTS.is_enabled,
        minScoreThreshold: DEFAULTS.min_score_threshold,
        storeContextEnabled: DEFAULTS.store_context_enabled,
        contextBeforeCount: DEFAULTS.context_before_count,
        contextAfterCount: DEFAULTS.context_after_count,
        dedupeWindowHours: DEFAULTS.dedupe_window_hours,
        coldFirstTouchPlaybook: DEFAULTS.cold_first_touch_playbook
      }
    });

    if (row.userId !== input.user_id) {
      throw new AppError(409, "LEADRADAR_SETTINGS_SCOPE_CONFLICT", "Settings exist for another user scope");
    }

    return leadRadarMappers.settings(row);
  }

  async updateSettings(input: UpdateLeadSettingsInput) {
    // Ensure record exists (create defaults) then patch.
    await this.createDefaultIfNotExists({ user_id: input.user_id, telegram_account_id: input.telegram_account_id });

    const row = await this.prisma.leadRadarSettings.update({
      where: { telegramAccountId: input.telegram_account_id },
      data: {
        ...(typeof input.patch.is_enabled === "boolean" ? { isEnabled: input.patch.is_enabled } : {}),
        ...(typeof input.patch.min_score_threshold === "number" ? { minScoreThreshold: input.patch.min_score_threshold } : {}),
        ...(typeof input.patch.store_context_enabled === "boolean"
          ? { storeContextEnabled: input.patch.store_context_enabled }
          : {}),
        ...(typeof input.patch.context_before_count === "number" ? { contextBeforeCount: input.patch.context_before_count } : {}),
        ...(typeof input.patch.context_after_count === "number" ? { contextAfterCount: input.patch.context_after_count } : {}),
        ...(typeof input.patch.dedupe_window_hours === "number" ? { dedupeWindowHours: input.patch.dedupe_window_hours } : {}),
        ...(typeof input.patch.cold_first_touch_playbook === "string"
          ? { coldFirstTouchPlaybook: input.patch.cold_first_touch_playbook }
          : {}),
        ...(input.patch.cold_first_touch_playbook === null ? { coldFirstTouchPlaybook: null } : {})
      }
    });

    // Re-check scope after update (defensive).
    if (row.userId !== input.user_id) {
      throw new AppError(409, "LEADRADAR_SETTINGS_SCOPE_CONFLICT", "Settings exist for another user scope");
    }

    return leadRadarMappers.settings(row);
  }
}

