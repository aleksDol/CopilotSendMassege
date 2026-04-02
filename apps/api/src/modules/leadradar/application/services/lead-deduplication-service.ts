import type { LeadRepository } from "../../infrastructure/repositories/lead-repository.js";
import type { LeadRadarMessageInput } from "../../types/ingestion.js";

export class LeadDeduplicationService {
  constructor(private readonly deps: { leadRepo: LeadRepository }) {}

  async isHardDuplicate(input: { message: LeadRadarMessageInput }): Promise<boolean> {
    return this.deps.leadRepo.existsByMessage({
      telegram_account_id: input.message.telegramAccountId,
      chat_id: input.message.chatId,
      message_id: input.message.messageId
    });
  }

  async isSoftDuplicate(input: { message: LeadRadarMessageInput; dedupeWindowHours: number }): Promise<boolean> {
    const senderId = input.message.senderId;
    if (!senderId) {
      return false;
    }

    const windowMs = Math.max(1, input.dedupeWindowHours) * 60 * 60 * 1000;
    const since = new Date(Date.now() - windowMs);

    return this.deps.leadRepo.existsRecentFromSenderInChat({
      user_id: input.message.userId,
      telegram_account_id: input.message.telegramAccountId,
      chat_id: input.message.chatId,
      telegram_user_id: senderId,
      since
    });
  }
}

