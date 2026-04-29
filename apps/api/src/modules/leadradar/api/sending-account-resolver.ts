import { ChannelAccountStatus, ChannelType, type PrismaClient } from "@prisma/client";
import { AppError } from "../../../lib/errors.js";

const ensureUsableSendingChannel = (row: {
  id: string;
  status: ChannelAccountStatus;
  sendingEnabled: boolean;
  telegram: { id: string } | null;
} | null) => {
  if (!row) {
    throw new AppError(403, "CHANNEL_ACCOUNT_FORBIDDEN", "Channel account does not belong to company");
  }
  if (row.status === ChannelAccountStatus.DISCONNECTED || !row.telegram) {
    throw new AppError(400, "TELEGRAM_NOT_CONNECTED", "Telegram account not connected");
  }
  if (!row.sendingEnabled) {
    throw new AppError(400, "TELEGRAM_SENDING_DISABLED", "Sending is disabled for this Telegram account");
  }
};

export async function resolveLeadRadarSendingChannelAccount(
  prisma: PrismaClient,
  params: {
    companyId: string;
    leadTelegramAccountId: string;
    preferredChannelAccountId?: string;
  }
): Promise<string> {
  const preferred = params.preferredChannelAccountId?.trim() ?? "";
  if (preferred) {
    const selected = await prisma.channelAccount.findFirst({
      where: {
        id: preferred,
        companyId: params.companyId,
        channelType: ChannelType.TELEGRAM
      },
      select: {
        id: true,
        status: true,
        sendingEnabled: true,
        telegram: { select: { id: true } }
      }
    });
    ensureUsableSendingChannel(selected);
    return selected!.id;
  }

  const leadAccount = await prisma.telegramAccount.findUnique({
    where: { id: params.leadTelegramAccountId },
    include: {
      channelAccount: {
        select: {
          id: true,
          companyId: true,
          status: true,
          sendingEnabled: true,
          telegram: { select: { id: true } }
        }
      }
    }
  });

  if (!leadAccount || leadAccount.channelAccount.companyId !== params.companyId) {
    throw new AppError(404, "TELEGRAM_ACCOUNT_NOT_FOUND", "Telegram account not found");
  }
  ensureUsableSendingChannel(leadAccount.channelAccount);
  return leadAccount.channelAccount.id;
}
