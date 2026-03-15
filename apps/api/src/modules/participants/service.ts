import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

export const upsertParticipant = async (params: {
  prisma: PrismaClient;
  companyId: string;
  channelAccountId: string;
  externalParticipantId: string;
  fullName?: string | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  isSelf?: boolean;
  metadata?: unknown;
}) => {
  return params.prisma.participant.upsert({
    where: {
      channelAccountId_externalParticipantId: {
        channelAccountId: params.channelAccountId,
        externalParticipantId: params.externalParticipantId
      }
    },
    update: {
      fullName: params.fullName ?? undefined,
      username: params.username ?? undefined,
      firstName: params.firstName ?? undefined,
      lastName: params.lastName ?? undefined,
      phone: params.phone ?? undefined,
      isSelf: params.isSelf ?? false,
      metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined
    },
    create: {
      companyId: params.companyId,
      channelAccountId: params.channelAccountId,
      externalParticipantId: params.externalParticipantId,
      fullName: params.fullName ?? null,
      username: params.username ?? null,
      firstName: params.firstName ?? null,
      lastName: params.lastName ?? null,
      phone: params.phone ?? null,
      isSelf: params.isSelf ?? false,
      metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined
    }
  });
};
