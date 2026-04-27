import { PrismaClient } from "@prisma/client";

type Options = {
  apply: boolean;
  companyId?: string;
  // Merge only this peer telegram user id (Participant.externalParticipantId) if provided.
  peerId?: string;
  // Skip groups with more conversations than this (default 3). Protects against bad participant data
  // where many unrelated conversations share the same externalParticipantId.
  maxGroupSize: number;
};

type ConversationRef = {
  id: string;
  externalConversationId: string;
  updatedAt: Date;
  title: string | null;
};

type DuplicateGroup = {
  companyId: string;
  channelAccountId: string;
  peerExternalParticipantId: string;
  conversations: ConversationRef[];
};

const isPrismaUniqueViolation = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as any).code === "P2002";

const isLikelyNumericId = (s: string): boolean => /^\d+$/.test(s);

function parseArgs(argv: string[]): Options {
  const opts: Options = { apply: false, maxGroupSize: 3 };
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
    if (arg === "--peer-id") {
      opts.peerId = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--max-group-size") {
      opts.maxGroupSize = parseInt(argv[i + 1], 10) || 3;
      i += 1;
      continue;
    }
  }
  return opts;
}

export function pickCanonicalConversation(params: {
  peerExternalParticipantId: string;
  conversations: ConversationRef[];
}): { canonicalId: string; mergedIds: string[] } {
  const numericPreferred = params.conversations.find(
    (c) => c.externalConversationId === params.peerExternalParticipantId && isLikelyNumericId(c.externalConversationId)
  );
  const canonical =
    numericPreferred ??
    [...params.conversations].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];

  return {
    canonicalId: canonical.id,
    mergedIds: params.conversations.filter((c) => c.id !== canonical.id).map((c) => c.id)
  };
}

function formatGroup(g: DuplicateGroup): string {
  const ids = g.conversations
    .map((c) => `${c.id}(${JSON.stringify(c.externalConversationId)})`)
    .join(", ");
  return [
    `companyId=${g.companyId}`,
    `channelAccountId=${g.channelAccountId}`,
    `peerId=${g.peerExternalParticipantId}`,
    `conversations=[${ids}]`
  ].join(" ");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    console.log(
      `[merge-direct-conversation-duplicates] mode=${opts.apply ? "APPLY" : "DRY-RUN"} companyId=${opts.companyId ?? "ALL"} peerId=${opts.peerId ?? "ALL"}`
    );

    // Find duplicates by (companyId, channelAccountId, peerExternalParticipantId) among DIRECT conversations.
    // We define peerExternalParticipantId as the externalParticipantId of the non-self participant in the conversation.
    const rows = await prisma.conversationParticipant.findMany({
      where: {
        participant: {
          isSelf: false,
          ...(opts.peerId ? { externalParticipantId: opts.peerId } : {})
        },
        conversation: {
          conversationType: "DIRECT",
          ...(opts.companyId ? { companyId: opts.companyId } : {}),
          isArchived: false
        }
      },
      select: {
        conversationId: true,
        participant: { select: { externalParticipantId: true } },
        conversation: {
          select: {
            companyId: true,
            channelAccountId: true,
            externalConversationId: true,
            updatedAt: true,
            title: true
          }
        }
      }
    });

    const keyToGroup = new Map<string, DuplicateGroup>();
    for (const r of rows) {
      // Direct chats should always have channelAccountId; if not, skip (safer).
      const channelAccountId = r.conversation.channelAccountId;
      if (!channelAccountId) continue;
      const peerExternalParticipantId = r.participant.externalParticipantId;
      if (!peerExternalParticipantId?.trim()) continue;
      const key = `${r.conversation.companyId}::${channelAccountId}::${peerExternalParticipantId}`;

      const g = keyToGroup.get(key) ?? {
        companyId: r.conversation.companyId,
        channelAccountId,
        peerExternalParticipantId,
        conversations: []
      };
      g.conversations.push({
        id: r.conversationId,
        externalConversationId: r.conversation.externalConversationId,
        updatedAt: r.conversation.updatedAt,
        title: r.conversation.title ?? null
      });
      keyToGroup.set(key, g);
    }

    const allDuplicateGroups = [...keyToGroup.values()].filter((g) => g.conversations.length > 1);
    const skippedLargeGroups = allDuplicateGroups.filter((g) => g.conversations.length > opts.maxGroupSize);
    const duplicateGroups = allDuplicateGroups.filter((g) => g.conversations.length <= opts.maxGroupSize);

    if (skippedLargeGroups.length > 0) {
      console.warn(
        `[merge-direct-conversation-duplicates] WARNING: skipped ${skippedLargeGroups.length} groups with more than ${opts.maxGroupSize} conversations (likely bad participant data):`
      );
      for (const g of skippedLargeGroups) {
        console.warn(
          `  SKIPPED peerId=${g.peerExternalParticipantId} companyId=${g.companyId} count=${g.conversations.length}`
        );
      }
    }

    console.log(`[merge-direct-conversation-duplicates] duplicate_groups_found=${duplicateGroups.length} skipped_large=${skippedLargeGroups.length}`);
    for (const g of duplicateGroups.slice(0, 200)) {
      const pick = pickCanonicalConversation({
        peerExternalParticipantId: g.peerExternalParticipantId,
        conversations: g.conversations
      });
      console.log(`- ${formatGroup(g)} canonical=${pick.canonicalId} merged=${pick.mergedIds.join(",")}`);
    }
    if (duplicateGroups.length > 200) {
      console.log(
        `[merge-direct-conversation-duplicates] output_truncated shown=200 total=${duplicateGroups.length}`
      );
    }

    if (!opts.apply) {
      console.log(
        "[merge-direct-conversation-duplicates] DRY-RUN: no changes performed. Re-run with --apply to merge references and archive duplicates."
      );
      return;
    }

    let mergedGroups = 0;
    let archivedConversations = 0;
    let movedMessages = 0;
    let movedSummaries = 0;
    let movedAiSuggestions = 0;
    let movedAiRuns = 0;
    let movedTasks = 0;
    let movedState = 0;
    let movedLead = 0;
    let skippedConflictingMessages = 0;
    let skippedDueToExistingCanonicalLead = 0;

    for (const g of duplicateGroups) {
      const { canonicalId, mergedIds } = pickCanonicalConversation({
        peerExternalParticipantId: g.peerExternalParticipantId,
        conversations: g.conversations
      });

      for (const fromId of mergedIds) {
          // Move Message rows one-by-one outside a transaction so that a P2002 conflict
          // on one message does not abort the whole batch (Postgres error 25P02).
          const fromMessages = await prisma.message.findMany({
            where: { conversationId: fromId },
            select: { id: true },
            orderBy: [{ sentAt: "asc" }, { id: "asc" }]
          });

          for (const m of fromMessages) {
            try {
              await prisma.message.update({
                where: { id: m.id },
                data: { conversationId: canonicalId }
              });
              movedMessages += 1;
            } catch (err: unknown) {
              if (isPrismaUniqueViolation(err)) {
                skippedConflictingMessages += 1;
                continue;
              }
              throw err;
            }
          }

          // ConversationState is 1:1 unique(conversationId). Prefer keeping canonical state if it exists.
          const canonicalState = await prisma.conversationState.findUnique({
            where: { conversationId: canonicalId },
            select: { conversationId: true }
          });
          if (!canonicalState) {
            const fromState = await prisma.conversationState.findUnique({
              where: { conversationId: fromId },
              select: { conversationId: true }
            });
            if (fromState) {
              await prisma.conversationState.update({
                where: { conversationId: fromId },
                data: { conversationId: canonicalId }
              });
              movedState += 1;
            }
          }

          // Lead is also 1:1 unique(conversationId). Prefer keeping canonical lead if it exists.
          const canonicalLead = await prisma.lead.findUnique({
            where: { conversationId: canonicalId },
            select: { id: true }
          });
          if (!canonicalLead) {
            const fromLead = await prisma.lead.findUnique({
              where: { conversationId: fromId },
              select: { id: true }
            });
            if (fromLead) {
              await prisma.lead.update({
                where: { id: fromLead.id },
                data: { conversationId: canonicalId }
              });
              movedLead += 1;
            }
          } else {
            const fromLead = await prisma.lead.findUnique({
              where: { conversationId: fromId },
              select: { id: true }
            });
            if (fromLead) skippedDueToExistingCanonicalLead += 1;
          }

          // Move ConversationSummary rows.
          const sumRes = await prisma.conversationSummary.updateMany({
            where: { conversationId: fromId },
            data: { conversationId: canonicalId }
          });
          movedSummaries += sumRes.count;

          // Move AiSuggestion rows.
          const sugRes = await prisma.aiSuggestion.updateMany({
            where: { conversationId: fromId },
            data: { conversationId: canonicalId }
          });
          movedAiSuggestions += sugRes.count;

          // AiRun.conversationId is nullable; safe to move.
          const runRes = await prisma.aiRun.updateMany({
            where: { conversationId: fromId },
            data: { conversationId: canonicalId }
          });
          movedAiRuns += runRes.count;

          // Task.conversationId is nullable; safe to move.
          const taskRes = await prisma.task.updateMany({
            where: { conversationId: fromId },
            data: { conversationId: canonicalId }
          });
          movedTasks += taskRes.count;

          // Archive the duplicate conversation row. Do NOT delete (safe).
          await prisma.conversation.update({
            where: { id: fromId },
            data: { isArchived: true }
          });
          archivedConversations += 1;
      }

      mergedGroups += 1;
    }

    console.log(
      [
        "[merge-direct-conversation-duplicates] APPLY complete",
        `groups_merged=${mergedGroups}`,
        `archived_conversations=${archivedConversations}`,
        `moved_messages=${movedMessages}`,
        `skipped_conflicting_messages=${skippedConflictingMessages}`,
        `moved_state=${movedState}`,
        `moved_lead=${movedLead}`,
        `skipped_due_to_existing_canonical_lead=${skippedDueToExistingCanonicalLead}`,
        `moved_summaries=${movedSummaries}`,
        `moved_aiSuggestions=${movedAiSuggestions}`,
        `moved_aiRuns=${movedAiRuns}`,
        `moved_tasks=${movedTasks}`
      ].join(" ")
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when executed as a script, not when imported in tests.
if (process.argv[1]?.includes("merge-direct-conversation-duplicates")) {
  void main();
}

