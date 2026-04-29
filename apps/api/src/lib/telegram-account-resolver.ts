import { ChannelAccountStatus, ChannelType, TelegramLoginStatus, type PrismaClient } from "@prisma/client";
import { AppError } from "./errors.js";

const TG_CONNECTED = "CONNECTED" as unknown as TelegramLoginStatus;
const TG_ERROR = "ERROR" as unknown as TelegramLoginStatus;

export type ResolvedTelegramScope = {
  telegramAccountId: string;
  channelAccountId: string;
};

export async function resolveTelegramAccountForRequest(
  prisma: PrismaClient,
  params: {
    companyId: string;
    userId: string;
    channelAccountId?: string | null;
  }
): Promise<ResolvedTelegramScope | null> {
  const requestedChannelId = params.channelAccountId?.trim() ?? "";
  if (requestedChannelId) {
    const explicit = await prisma.channelAccount.findFirst({
      where: {
        id: requestedChannelId,
        companyId: params.companyId,
        channelType: ChannelType.TELEGRAM
      },
      include: { telegram: true }
    });

    if (!explicit) {
      throw new AppError(403, "TELEGRAM_ACCOUNT_FORBIDDEN", "Telegram account does not belong to company");
    }

    if (explicit.status === ChannelAccountStatus.DISCONNECTED || !explicit.telegram) {
      throw new AppError(400, "TELEGRAM_ACCOUNT_NOT_AVAILABLE", "Telegram account is not available");
    }

    return {
      telegramAccountId: explicit.telegram.id,
      channelAccountId: explicit.id
    };
  }

  const fallback = await prisma.telegramAccount.findFirst({
    where: {
      loginStatus: { in: [TG_CONNECTED, TG_ERROR] },
      channelAccount: {
        companyId: params.companyId,
        channelType: ChannelType.TELEGRAM,
        status: { not: ChannelAccountStatus.DISCONNECTED }
      }
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, channelAccountId: true }
  });

  if (!fallback) return null;
  return {
    telegramAccountId: fallback.id,
    channelAccountId: fallback.channelAccountId
  };
}
