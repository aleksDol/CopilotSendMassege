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
      // Only match the canonical conversation: the one whose externalConversationId equals the
      // numeric peer id AND the peer is a participant AND it is not archived.
      // We intentionally do NOT fall back to "any DIRECT conversation with this peer" because
      // that can route messages for Person A into Person B's conversation when participant
      // records were displaced by a bad data migration.
      const exact = await prisma.conversationParticipant.findFirst({
        where: {
          participantId: peer.id,
          conversation: {
            channelAccountId: params.channelAccountId,
            conversationType: "DIRECT",
            externalConversationId: params.peerExternalParticipantId,
            isArchived: false
          }
        },
        select: {
          conversation: {
            select: { id: true, externalConversationId: true }
          }
        }
      });

      const existingId = exact?.conversation?.id ?? null;
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

