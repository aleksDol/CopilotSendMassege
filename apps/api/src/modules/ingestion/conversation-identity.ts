import type { PrismaClient } from "@prisma/client";

const sanitizeDbString = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const withoutNul = raw.replaceAll("\u0000", "");
  return Buffer.from(withoutNul, "utf8").toString("utf8");
};

export async function resolveConversationForMessage(
  prisma: PrismaClient,
  params: {
    companyId: string;
    channelAccountId: string;
    externalConversationId: string;
    conversationType: "DIRECT" | "GROUP" | "CHANNEL";
    conversationTitle?: string | null;
    // For DIRECT dialogs: stable peer telegram user id (not username).
    peerExternalParticipantId?: string | null;
  }
) {
  const title = sanitizeDbString(params.conversationTitle) ?? null;

  // DIRECT dedupe:
  // Telegram identity can arrive as numeric userId or as username, both may create different
  // Conversation.externalConversationId values. If we can resolve the peer participant by
  // telegramUserId (externalParticipantId), we prefer an existing DIRECT conversation for it.
  if (params.conversationType === "DIRECT" && params.peerExternalParticipantId) {
    const peer = await prisma.participant.findUnique({
      where: {
        channelAccountId_externalParticipantId: {
          channelAccountId: params.channelAccountId,
          externalParticipantId: params.peerExternalParticipantId
        }
      },
      select: { id: true }
    });

    if (peer?.id) {
      // Prefer the conversation whose externalConversationId already equals the numeric peer id (canonical).
      const exact = await prisma.conversationParticipant.findFirst({
        where: {
          participantId: peer.id,
          conversation: {
            channelAccountId: params.channelAccountId,
            conversationType: "DIRECT",
            externalConversationId: params.peerExternalParticipantId
          }
        },
        select: {
          conversation: {
            select: { id: true, externalConversationId: true }
          }
        }
      });

      const any =
        exact ??
        (await prisma.conversationParticipant.findFirst({
          where: {
            participantId: peer.id,
            conversation: {
              channelAccountId: params.channelAccountId,
              conversationType: "DIRECT"
            }
          },
          orderBy: { joinedAt: "desc" },
          select: {
            conversation: {
              select: { id: true, externalConversationId: true }
            }
          }
        }));

      const existingId = any?.conversation?.id ?? null;
      if (existingId) {
        if (title) {
          await prisma.conversation.update({
            where: { id: existingId },
            data: { title }
          });
        }
        return prisma.conversation.findUniqueOrThrow({ where: { id: existingId } });
      }
    }
  }

  // Fallback: existing behavior (uniqueness by channelAccountId + externalConversationId).
  return prisma.conversation.upsert({
    where: {
      channelAccountId_externalConversationId: {
        channelAccountId: params.channelAccountId,
        externalConversationId: params.externalConversationId
      }
    },
    update: {
      title: title ?? undefined
    },
    create: {
      companyId: params.companyId,
      channelAccountId: params.channelAccountId,
      externalConversationId: params.externalConversationId,
      conversationType: params.conversationType,
      title
    }
  });
}

