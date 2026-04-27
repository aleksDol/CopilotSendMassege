/**
 * recover-misrouted-messages.ts
 *
 * Fixes data corruption caused by a bad conversation merge that moved messages
 * from many distinct DIRECT conversations into one "canonical" conversation.
 *
 * What this script does:
 * 1. Finds DIRECT conversations that contain INBOUND messages from participants
 *    who are NOT the expected peer of that conversation (pollution indicator).
 * 2. For each foreign INBOUND message, finds/creates the correct conversation
 *    by matching participant.externalParticipantId → conversation.externalConversationId.
 * 3. Moves the message to the correct conversation (dry-run by default).
 * 4. Also restores ConversationParticipant records for each affected conversation.
 *
 * Run dry-run first:
 *   npx tsx apps/api/src/scripts/recover-misrouted-messages.ts
 *
 * Then apply:
 *   npx tsx apps/api/src/scripts/recover-misrouted-messages.ts --apply
 *
 * Filter by company:
 *   npx tsx apps/api/src/scripts/recover-misrouted-messages.ts --apply --company-id <uuid>
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Options = {
  apply: boolean;
  companyId?: string;
};

function parseArgs(argv: string[]): Options {
  const opts: Options = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") { opts.apply = true; continue; }
    if (arg === "--company-id") { opts.companyId = argv[i + 1]; i++; continue; }
  }
  return opts;
}

const isPrismaUniqueViolation = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as any).code === "P2002";

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`\n=== recover-misrouted-messages ===`);
  console.log(`Mode: ${opts.apply ? "APPLY" : "DRY-RUN"}`);
  if (opts.companyId) console.log(`Company filter: ${opts.companyId}`);
  console.log("");

  // Step 1: Find polluted conversations.
  // A DIRECT conversation is "polluted" if it has INBOUND messages whose sender (participantId)
  // is NOT a non-self participant of that conversation.
  //
  // Strategy: for each DIRECT conversation, get its non-self participant's externalParticipantId.
  // Then find messages where the message.participant.externalParticipantId != conversation's peer.

  const companyFilter = opts.companyId ? { companyId: opts.companyId } : {};

  // Get all DIRECT conversations with their expected peer participant
  const conversations = await prisma.conversation.findMany({
    where: {
      conversationType: "DIRECT",
      isArchived: false,
      ...companyFilter,
    },
    select: {
      id: true,
      companyId: true,
      channelAccountId: true,
      externalConversationId: true,
      title: true,
      participants: {
        select: {
          participant: {
            select: {
              id: true,
              externalParticipantId: true,
              isSelf: true,
            }
          }
        }
      }
    }
  });

  console.log(`Found ${conversations.length} non-archived DIRECT conversations to inspect.`);

  let pollutedCount = 0;
  let messagesFound = 0;
  let messagesFixed = 0;
  let messagesSkipped = 0;
  let cpRestored = 0;

  for (const conv of conversations) {
    const peerParticipant = conv.participants.find(cp => !cp.participant.isSelf)?.participant ?? null;
    if (!peerParticipant) continue;

    const expectedPeerId = peerParticipant.id;

    // Find INBOUND messages in this conversation sent by someone OTHER than the expected peer
    const foreignMessages = await prisma.message.findMany({
      where: {
        conversationId: conv.id,
        direction: "INBOUND",
        participantId: { not: expectedPeerId, notIn: [expectedPeerId] },
        NOT: { participantId: null },
      },
      select: {
        id: true,
        externalMessageId: true,
        participantId: true,
        sentAt: true,
        participant: {
          select: {
            id: true,
            externalParticipantId: true,
            isSelf: true,
            fullName: true,
            username: true,
          }
        }
      },
      orderBy: { sentAt: "asc" },
    });

    if (foreignMessages.length === 0) continue;

    pollutedCount++;
    messagesFound += foreignMessages.length;
    console.log(
      `\n[POLLUTED] conv=${conv.id} externalId=${conv.externalConversationId} ` +
      `title="${conv.title ?? "(no title)"}" peer=${peerParticipant.externalParticipantId} ` +
      `→ ${foreignMessages.length} foreign INBOUND messages`
    );

    // Group foreign messages by their actual sender
    const bySender = new Map<string, typeof foreignMessages>();
    for (const msg of foreignMessages) {
      if (!msg.participant) continue;
      const senderId = msg.participant.id;
      if (!bySender.has(senderId)) bySender.set(senderId, []);
      bySender.get(senderId)!.push(msg);
    }

    for (const [, msgs] of bySender) {
      const sender = msgs[0].participant!;
      if (sender.isSelf) {
        console.log(
          `  [SKIP] sender=${sender.externalParticipantId} is self — cannot determine target conversation`
        );
        messagesSkipped += msgs.length;
        continue;
      }

      const senderExtId = sender.externalParticipantId;
      console.log(
        `  [SENDER] ${senderExtId} (${sender.fullName ?? sender.username ?? "unknown"}) — ${msgs.length} messages`
      );

      // The correct conversation for this sender should have externalConversationId = senderExtId
      // (in Telegram, chatId = peer userId for DIRECT chats)
      const correctConv = await prisma.conversation.findFirst({
        where: {
          channelAccountId: conv.channelAccountId,
          externalConversationId: senderExtId,
          conversationType: "DIRECT",
        },
        select: { id: true, externalConversationId: true, title: true, isArchived: true }
      });

      if (!correctConv) {
        console.log(
          `  [WARN] No conversation found with externalConversationId=${senderExtId} for channelAccount=${conv.channelAccountId}. ` +
          `Messages will be skipped — they need manual review.`
        );
        messagesSkipped += msgs.length;
        continue;
      }

      console.log(
        `  [TARGET] conv=${correctConv.id} externalId=${correctConv.externalConversationId} ` +
        `title="${correctConv.title ?? "(no title)"}" archived=${correctConv.isArchived}`
      );

      if (opts.apply) {
        // Unarchive the target conversation if needed
        if (correctConv.isArchived) {
          await prisma.conversation.update({
            where: { id: correctConv.id },
            data: { isArchived: false }
          });
          console.log(`  [UNARCHIVED] conv=${correctConv.id}`);
        }

        // Restore ConversationParticipant for sender in target conversation
        try {
          await prisma.conversationParticipant.upsert({
            where: {
              conversationId_participantId: {
                conversationId: correctConv.id,
                participantId: sender.id,
              }
            },
            update: {},
            create: {
              conversationId: correctConv.id,
              participantId: sender.id,
              joinedAt: new Date(),
            }
          });
          cpRestored++;
          console.log(`  [CP_RESTORED] participant=${sender.externalParticipantId} → conv=${correctConv.id}`);
        } catch (e) {
          if (!isPrismaUniqueViolation(e)) {
            console.error(`  [ERROR] Failed to restore CP for sender=${senderExtId}:`, e);
          }
        }

        // Move messages one by one (skip conflicts)
        for (const msg of msgs) {
          try {
            await prisma.message.update({
              where: { id: msg.id },
              data: { conversationId: correctConv.id }
            });
            messagesFixed++;
          } catch (e) {
            if (isPrismaUniqueViolation(e)) {
              console.log(
                `  [CONFLICT] msg=${msg.id} externalMessageId=${msg.externalMessageId} already exists in target — deleting source copy`
              );
              try {
                await prisma.message.delete({ where: { id: msg.id } });
                messagesFixed++;
              } catch (delErr) {
                console.error(`  [ERROR] Could not delete duplicate message ${msg.id}:`, delErr);
                messagesSkipped++;
              }
            } else {
              console.error(`  [ERROR] Failed to move message ${msg.id}:`, e);
              messagesSkipped++;
            }
          }
        }
      } else {
        // Dry-run
        for (const msg of msgs) {
          console.log(
            `  [DRY-RUN] Would move msg=${msg.id} externalMessageId=${msg.externalMessageId} ` +
            `sentAt=${msg.sentAt.toISOString()} → conv=${correctConv.id}`
          );
        }
        messagesFixed += msgs.length;
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Polluted conversations found: ${pollutedCount}`);
  console.log(`Foreign INBOUND messages found: ${messagesFound}`);
  console.log(`Messages ${opts.apply ? "moved" : "would be moved"}: ${messagesFixed}`);
  console.log(`Messages skipped (no target found or self-sender): ${messagesSkipped}`);
  console.log(`ConversationParticipant records restored: ${cpRestored}`);

  if (!opts.apply && messagesFound > 0) {
    console.log(`\nRun with --apply to move the messages.`);
  }
  if (messagesFound === 0) {
    console.log(`\nNo misrouted messages found. Data looks clean.`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
