import { ChannelAccountStatus, ChannelType, PrismaClient, TelegramLoginStatus } from "@prisma/client";

type Options = {
  apply: boolean;
  companyId?: string;
  sourceChannelAccountId?: string;
};

type ConversationOwnerRow = {
  conversationId: string;
  externalConversationId: string;
  selfExternalParticipantId: string | null;
};

function parseArgs(argv: string[]): Options {
  const opts: Options = { apply: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") {
      opts.apply = true;
      continue;
    }
    if (arg === "--company-id") {
      opts.companyId = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--source-channel-account-id") {
      opts.sourceChannelAccountId = argv[i + 1];
      i += 1;
      continue;
    }
  }

  return opts;
}

function grouped<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const prev = map.get(k) ?? [];
    prev.push(item);
    map.set(k, prev);
  }
  return map;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const sourceChannels = await prisma.channelAccount.findMany({
      where: {
        channelType: ChannelType.TELEGRAM,
        ...(opts.companyId ? { companyId: opts.companyId } : {}),
        ...(opts.sourceChannelAccountId ? { id: opts.sourceChannelAccountId } : {})
      },
      include: {
        telegram: true
      },
      orderBy: { updatedAt: "desc" }
    });

    if (sourceChannels.length === 0) {
      console.log("No Telegram channel accounts matched filters.");
      return;
    }

    console.log(
      `[split-mixed-telegram-conversations] mode=${opts.apply ? "APPLY" : "DRY-RUN"} channels=${sourceChannels.length}`
    );

    for (const source of sourceChannels) {
      const ownerRows = (await prisma.$queryRaw`
        WITH ranked_self AS (
          SELECT
            c."id" AS "conversationId",
            c."externalConversationId" AS "externalConversationId",
            p."externalParticipantId" AS "selfExternalParticipantId",
            ROW_NUMBER() OVER (
              PARTITION BY c."id"
              ORDER BY cp."joinedAt" DESC, cp."id" DESC
            ) AS rn
          FROM "Conversation" c
          LEFT JOIN "ConversationParticipant" cp
            ON cp."conversationId" = c."id"
          LEFT JOIN "Participant" p
            ON p."id" = cp."participantId"
           AND p."isSelf" = true
          WHERE c."channelAccountId" = ${source.id}
        )
        SELECT "conversationId", "externalConversationId", "selfExternalParticipantId"
        FROM ranked_self
        WHERE rn = 1
      `) as ConversationOwnerRow[];

      const bySelf = grouped(ownerRows, (r) => r.selfExternalParticipantId ?? "__unknown__");
      const selfKeys = [...bySelf.keys()].filter((k) => k !== "__unknown__");

      if (selfKeys.length <= 1) {
        console.log(`- source=${source.id} mixed=false conversations=${ownerRows.length}`);
        continue;
      }

      const counts = selfKeys
        .map((k) => ({ self: k, count: bySelf.get(k)?.length ?? 0 }))
        .sort((a, b) => b.count - a.count);

      const keepSelfId =
        source.telegram?.telegramUserId && bySelf.has(source.telegram.telegramUserId)
          ? source.telegram.telegramUserId
          : counts[0]?.self;

      if (!keepSelfId) {
        console.log(`- source=${source.id} skipped: cannot resolve keepSelfId`);
        continue;
      }

      const moveGroups = counts.filter((c) => c.self !== keepSelfId);
      const moveTotal = moveGroups.reduce((acc, g) => acc + g.count, 0);
      console.log(
        `- source=${source.id} mixed=true keepSelf=${keepSelfId} moveConversations=${moveTotal} groups=${moveGroups.length}`
      );

      for (const group of moveGroups) {
        const rows = bySelf.get(group.self) ?? [];
        const conversationIds = rows.map((r) => r.conversationId);
        const externalConversationIds = rows.map((r) => r.externalConversationId);
        const targetExternalAccountId = `legacy-tg-${group.self}`;

        console.log(
          `  -> self=${group.self} conversations=${conversationIds.length} targetExternalAccountId=${targetExternalAccountId}`
        );

        if (!opts.apply) {
          continue;
        }

        await prisma.$transaction(async (tx) => {
          const targetChannel = await tx.channelAccount.upsert({
            where: {
              companyId_channelType_externalAccountId: {
                companyId: source.companyId,
                channelType: ChannelType.TELEGRAM,
                externalAccountId: targetExternalAccountId
              }
            },
            update: {
              displayName: `Telegram legacy ${group.self}`,
              status: ChannelAccountStatus.DISCONNECTED
            },
            create: {
              companyId: source.companyId,
              channelType: ChannelType.TELEGRAM,
              externalAccountId: targetExternalAccountId,
              displayName: `Telegram legacy ${group.self}`,
              status: ChannelAccountStatus.DISCONNECTED,
              createdByUserId: source.createdByUserId,
              isPrimary: false
            }
          });

          await tx.telegramAccount.upsert({
            where: { channelAccountId: targetChannel.id },
            update: {
              telegramUserId: group.self,
              loginStatus: TelegramLoginStatus.LOGIN_REQUIRED,
              sessionDataEncrypted: null,
              errorMessage: null
            },
            create: {
              channelAccountId: targetChannel.id,
              telegramUserId: group.self,
              loginStatus: TelegramLoginStatus.LOGIN_REQUIRED
            }
          });

          const conflicts = await tx.conversation.findMany({
            where: {
              channelAccountId: targetChannel.id,
              externalConversationId: { in: externalConversationIds }
            },
            select: { id: true, externalConversationId: true }
          });

          if (conflicts.length > 0) {
            throw new Error(
              `Conflict: target channel ${targetChannel.id} already has ${conflicts.length} conversations by externalConversationId`
            );
          }

          await tx.conversation.updateMany({
            where: { id: { in: conversationIds } },
            data: { channelAccountId: targetChannel.id }
          });

          const oldParticipants = await tx.participant.findMany({
            where: {
              channelAccountId: source.id,
              OR: [
                {
                  conversationParticipants: {
                    some: { conversationId: { in: conversationIds } }
                  }
                },
                {
                  messages: {
                    some: { conversationId: { in: conversationIds } }
                  }
                }
              ]
            }
          });

          const participantIdMap = new Map<string, string>();
          for (const oldP of oldParticipants) {
            const targetP = await tx.participant.upsert({
              where: {
                channelAccountId_externalParticipantId: {
                  channelAccountId: targetChannel.id,
                  externalParticipantId: oldP.externalParticipantId
                }
              },
              update: {
                username: oldP.username,
                fullName: oldP.fullName,
                firstName: oldP.firstName,
                lastName: oldP.lastName,
                phone: oldP.phone,
                isSelf: oldP.isSelf,
                metadata: oldP.metadata ?? undefined
              },
              create: {
                companyId: oldP.companyId,
                channelAccountId: targetChannel.id,
                externalParticipantId: oldP.externalParticipantId,
                username: oldP.username,
                fullName: oldP.fullName,
                firstName: oldP.firstName,
                lastName: oldP.lastName,
                phone: oldP.phone,
                isSelf: oldP.isSelf,
                metadata: oldP.metadata ?? undefined
              }
            });
            participantIdMap.set(oldP.id, targetP.id);
          }

          for (const [oldId, newId] of participantIdMap.entries()) {
            await tx.conversationParticipant.updateMany({
              where: {
                participantId: oldId,
                conversationId: { in: conversationIds }
              },
              data: { participantId: newId }
            });

            await tx.message.updateMany({
              where: {
                participantId: oldId,
                conversationId: { in: conversationIds }
              },
              data: { participantId: newId }
            });
          }
        });
      }
    }

    console.log("[split-mixed-telegram-conversations] done");
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((err) => {
  console.error("[split-mixed-telegram-conversations] failed", err);
  process.exit(1);
});

