import type { LeadKeyword } from "../../domain/entities/lead-keyword.js";
import type { LeadNegativeKeyword } from "../../domain/entities/lead-negative-keyword.js";
import type {
  CreateLeadKeywordInput,
  CreateNegativeKeywordInput,
  ListAccountScopedInput,
  UpdateLeadKeywordInput,
  UpdateNegativeKeywordInput
} from "../../types/repository-inputs.js";

export interface LeadKeywordRepository {
  listKeywords(input: ListAccountScopedInput): Promise<LeadKeyword[]>;
  addKeyword(input: CreateLeadKeywordInput): Promise<LeadKeyword>;
  updateKeyword(input: UpdateLeadKeywordInput): Promise<LeadKeyword>;
  removeKeyword(input: { id: string; user_id: string; telegram_account_id: string }): Promise<void>;

  listNegativeKeywords(input: ListAccountScopedInput): Promise<LeadNegativeKeyword[]>;
  addNegativeKeyword(input: CreateNegativeKeywordInput): Promise<LeadNegativeKeyword>;
  updateNegativeKeyword(input: UpdateNegativeKeywordInput): Promise<LeadNegativeKeyword>;
  removeNegativeKeyword(input: { id: string; user_id: string; telegram_account_id: string }): Promise<void>;
}

