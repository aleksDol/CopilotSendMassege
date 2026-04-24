import type { Lead } from "../../domain/entities/lead.js";
import type { LeadRepository } from "../../infrastructure/repositories/lead-repository.js";

const normalizeUsername = (raw: string | null | undefined): string | null => {
  const t = raw?.trim();
  if (!t) return null;
  return t.replace(/^@+/u, "").toLowerCase();
};

export class AuthorProfileLeadDedupeService {
  constructor(private readonly deps: { leadRepo: LeadRepository }) {}

  async findExistingAuthorProfileLead(input: {
    telegramAccountId: string;
    telegramUserId?: string | null;
    username?: string | null;
  }): Promise<Lead | null> {
    const telegramUserId = input.telegramUserId?.trim() || null;
    if (telegramUserId) {
      return this.deps.leadRepo.findExistingAuthorProfileLead({
        telegram_account_id: input.telegramAccountId,
        telegram_user_id: telegramUserId
      });
    }

    const username = normalizeUsername(input.username);
    if (!username) return null;

    return this.deps.leadRepo.findExistingAuthorProfileLead({
      telegram_account_id: input.telegramAccountId,
      username_normalized: username
    });
  }
}

