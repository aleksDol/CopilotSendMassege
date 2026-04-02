import type { LeadSource } from "../../domain/entities/lead-source.js";
import type { CreateLeadSourceInput, FindSourceByTelegramChatIdInput, ListAccountScopedInput, UpdateLeadSourceInput } from "../../types/repository-inputs.js";

export interface LeadSourceRepository {
  listSources(input: ListAccountScopedInput): Promise<LeadSource[]>;
  addSource(input: CreateLeadSourceInput): Promise<LeadSource>;
  updateSource(input: UpdateLeadSourceInput): Promise<LeadSource>;
  removeSource(input: { id: string; user_id: string; telegram_account_id: string }): Promise<void>;
  findByTelegramChatId(input: FindSourceByTelegramChatIdInput): Promise<LeadSource | null>;
}

