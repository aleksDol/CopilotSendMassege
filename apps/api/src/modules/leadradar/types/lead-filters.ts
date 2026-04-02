import type { LeadStatus } from "../domain/enums/lead-status.js";

export type LeadFilters = {
  status?: LeadStatus;
  chat_id?: string;
  keyword?: string;
  search?: string;
  date_from?: Date;
  date_to?: Date;
};

