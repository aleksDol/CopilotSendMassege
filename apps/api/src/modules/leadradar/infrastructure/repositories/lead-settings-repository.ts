import type { LeadSettings } from "../../domain/entities/lead-settings.js";
import type { ListAccountScopedInput, UpdateLeadSettingsInput } from "../../types/repository-inputs.js";

export interface LeadSettingsRepository {
  getSettings(input: ListAccountScopedInput): Promise<LeadSettings | null>;
  updateSettings(input: UpdateLeadSettingsInput): Promise<LeadSettings>;
  createDefaultIfNotExists(input: ListAccountScopedInput): Promise<LeadSettings>;
}

