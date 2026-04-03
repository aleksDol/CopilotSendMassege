import type { Lead } from "../../domain/entities/lead.js";
import type { LeadSettings } from "../../domain/entities/lead-settings.js";
import type { CreateLeadInput, ExistsByMessageInput, FindLeadByIdInput, FindLeadFiltersInput, UpdateLeadNotesInput, UpdateLeadStatusInput } from "../../types/repository-inputs.js";

export interface LeadRepository {
  createLead(input: CreateLeadInput): Promise<Lead>;
  findById(input: FindLeadByIdInput): Promise<(Lead & { context?: unknown | null; events?: unknown[] }) | null>;
  findByFilters(input: FindLeadFiltersInput): Promise<{ items: Lead[]; page: number; limit: number; total: number }>;
  updateStatus(input: UpdateLeadStatusInput): Promise<Lead>;
  updateNotes(input: UpdateLeadNotesInput): Promise<Lead>;
  removeLead(input: { id: string; user_id: string; telegram_account_id: string }): Promise<void>;
  existsByMessage(input: ExistsByMessageInput): Promise<boolean>;

  existsRecentFromSenderInChat(input: {
    user_id: string;
    telegram_account_id: string;
    chat_id: string;
    telegram_user_id: string;
    since: Date;
  }): Promise<boolean>;

  // Optional helper for next steps (not used yet)
  _getSettingsForScope?(input: { user_id: string; telegram_account_id: string }): Promise<LeadSettings | null>;
}

