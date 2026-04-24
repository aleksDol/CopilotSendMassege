import type { LeadCategory } from "../enums/lead-category.js";
import type { LeadMatchType } from "../enums/lead-match-type.js";
import type { LeadKeywordTarget } from "../enums/lead-keyword-target.js";

export type LeadKeyword = {
  id: string;
  user_id: string;
  telegram_account_id: string;
  keyword: string;
  target: LeadKeywordTarget;
  match_type: LeadMatchType;
  category: LeadCategory;
  priority: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};
