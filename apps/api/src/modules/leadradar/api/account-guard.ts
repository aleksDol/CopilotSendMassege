import { ChannelAccountStatus, ChannelType, TelegramLoginStatus, type PrismaClient } from "@prisma/client";
import { AppError } from "../../../lib/errors.js";

const TG_CONNECTED = "CONNECTED" as unknown as TelegramLoginStatus;
const TG_ERROR = "ERROR" as unknown as TelegramLoginStatus;

export async function resolveActiveLeadRadarTelegramAccount(
  prisma: PrismaClient,
  params: { companyId: string; userId: string; channelAccountId?: string; onFallbackMultiAccountWarning?: () => void }
) {
  const selectedChannelAccountId = params.channelAccountId?.trim() ?? "";
  if (selectedChannelAccountId) {
    const selected = await prisma.channelAccount.findFirst({
      where: {
        id: selectedChannelAccountId,
        companyId: params.companyId,
        channelType: ChannelType.TELEGRAM,
        createdByUserId: params.userId
      },
      select: {
        id: true,
        status: true,
        parsingEnabled: true,
        telegram: { select: { id: true, loginStatus: true } }
      }
    });

    if (!selected) {
      throw new AppError(403, "TELEGRAM_ACCOUNT_FORBIDDEN", "Telegram account is not available for this company");
    }
    if (!selected.parsingEnabled) {
      throw new AppError(400, "TELEGRAM_PARSING_DISABLED", "Parsing is disabled for this Telegram account");
    }
    if (
      selected.status === ChannelAccountStatus.DISCONNECTED ||
      !selected.telegram ||
      ![TG_CONNECTED, TG_ERROR].includes(selected.telegram.loginStatus)
    ) {
      throw new AppError(400, "TELEGRAM_ACCOUNT_NOT_AVAILABLE", "Telegram account is not connected");
    }

    return { id: selected.telegram.id, channelAccountId: selected.id };
  }

  const parsingEnabledCount = await prisma.channelAccount.count({
    where: {
      companyId: params.companyId,
      channelType: ChannelType.TELEGRAM,
      createdByUserId: params.userId,
      parsingEnabled: true,
      status: { not: ChannelAccountStatus.DISCONNECTED },
      telegram: {
        is: {
          loginStatus: { in: [TG_CONNECTED, TG_ERROR] }
        }
      }
    }
  });
  if (parsingEnabledCount > 1) {
    params.onFallbackMultiAccountWarning?.();
  }

  return prisma.telegramAccount.findFirst({
    where: {
      loginStatus: { in: [TG_CONNECTED, TG_ERROR] },
      channelAccount: {
        companyId: params.companyId,
        channelType: ChannelType.TELEGRAM,
        createdByUserId: params.userId,
        parsingEnabled: true,
        status: { not: ChannelAccountStatus.DISCONNECTED }
      }
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, channelAccountId: true }
  });
}
