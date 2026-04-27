import { PrismaClient, type ConversationType } from "@prisma/client";

type Options = {
  apply: boolean;
  companyId?: string;
  channelAccountId?: string;
};

type Logger = Pick<typeof console, "log" | "error">;

type ConversationSnapshot = {
  id: string;
  companyId: string;
  channelAccountId: string;
  externalConversationId: string;
  conversationType: ConversationType;
  isArchived: boolean;
  lastMessageAt: Date | null;
  leadId: string | null;
  participants: ParticipantSnapshot[];
};

type ParticipantSnapshot = {
  id: string;
  externalParticipantId: string | null;
  username: string | null;
  isSelf: boolean;
};

type ArchiveReason =
  | "proof_shared_non_self_participant"
  | "duplicate_leads_preserved"
  | "needs_manual_review_or_followup_relink"
  | "numeric_lead_kept_archive_username_duplicate";

export type ArchiveCandidate = {
  usernameConversationId: string;
  usernameExternalConversationId: string;
  numericConversationId: string;
  numericExternalConversationId: string;
  companyId: string;
  channelAccountId: string;
  participantId: string;
  participantExternalParticipantId: string;
  participantUsername: string | null;
  usernameConversationLastMessageAt: Date | null;
  numericConversationLastMessageAt: Date | null;
  usernameConversationLeadId: string | null;
  numericConversationLeadId: string | null;
  reason: string;
};

export type ArchivePlanSummary = {
  scannedDirectConversations: number;
  usernameLikeCandidates: number;
  eligibleForArchive: number;
  skippedNoNumericCounterpart: number;
  skippedNoSafeParticipantProof: number;
  skippedSelfParticipant: number;
  skippedAlreadyArchived: number;
};

export type ArchivePlan = {
  candidates: ArchiveCandidate[];
  summary: ArchivePlanSummary;
};

type ScriptPrisma = {
  conversation: {
    findMany: (args: unknown) => Promise<
      Array<{
        id: string;
        companyId: string;
        channelAccountId: string;
        externalConversationId: string;
        conversationType: ConversationType;
        isArchived: boolean;
        state: { lastMessageAt: Date | null } | null;
        lead: { id: string } | null;
        participants: Array<{
          participant: {
            id: string;
            externalParticipantId: string;
            username: string | null;
            isSelf: boolean;
          };
        }>;
      }>
    >;
    update: (args: unknown) => Promise<unknown>;
  };
  telegramAccount: {
    findMany: (args: unknown) => Promise<Array<{ channelAccountId: string; telegramUserId: string }>>;
  };
};

export function parseArgs(argv: string[]): Options {
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
    if (arg === "--channel-account-id") {
      opts.channelAccountId = argv[i + 1];
      i += 1;
      continue;
    }
  }
  return opts;
}

export const isPurelyNumericId = (value: string): boolean => /^\d+$/.test(value.trim());

export const normalizeUsernameLike = (value: string | null | undefined): string => {
  if (!value) return "";
  const trimmed = value.trim();
  const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  return withoutAt.trim().toLowerCase();
};

export const isUsernameLikeExternalConversationId = (value: string): boolean => {
  const normalized = normalizeUsernameLike(value);
  if (!normalized) return false;
  if (isPurelyNumericId(normalized)) return false;
  return /^[a-z0-9_]+$/i.test(normalized);
};

const getGroupKey = (companyId: string, channelAccountId: string): string => `${companyId}::${channelAccountId}`;

const mapLeadHandling = (usernameLeadId: string | null, numericLeadId: string | null): ArchiveReason => {
  if (usernameLeadId && numericLeadId) return "duplicate_leads_preserved";
  if (usernameLeadId && !numericLeadId) return "needs_manual_review_or_followup_relink";
  return "numeric_lead_kept_archive_username_duplicate";
};

export function buildArchivePlan(params: {
  conversations: ConversationSnapshot[];
  ownerSelfIdsByChannel: Map<string, Set<string>>;
}): ArchivePlan {
  const directConversations = params.conversations.filter((c) => c.conversationType === "DIRECT");
  const summary: ArchivePlanSummary = {
    scannedDirectConversations: directConversations.length,
    usernameLikeCandidates: 0,
    eligibleForArchive: 0,
    skippedNoNumericCounterpart: 0,
    skippedNoSafeParticipantProof: 0,
    skippedSelfParticipant: 0,
    skippedAlreadyArchived: 0
  };

  const byGroup = new Map<string, ConversationSnapshot[]>();
  for (const conversation of directConversations) {
    const key = getGroupKey(conversation.companyId, conversation.channelAccountId);
    const groupRows = byGroup.get(key) ?? [];
    groupRows.push(conversation);
    byGroup.set(key, groupRows);
  }

  const candidates: ArchiveCandidate[] = [];

  for (const groupRows of byGroup.values()) {
    const numericByExternalConversationId = new Map<string, ConversationSnapshot>();
    const conversationIdsByParticipantId = new Map<string, Set<string>>();

    for (const conversation of groupRows) {
      if (isPurelyNumericId(conversation.externalConversationId)) {
        numericByExternalConversationId.set(conversation.externalConversationId, conversation);
      }
      for (const p of conversation.participants) {
        const ids = conversationIdsByParticipantId.get(p.id) ?? new Set<string>();
        ids.add(conversation.id);
        conversationIdsByParticipantId.set(p.id, ids);
      }
    }

    for (const conversation of groupRows) {
      if (!isUsernameLikeExternalConversationId(conversation.externalConversationId)) continue;
      summary.usernameLikeCandidates += 1;

      if (conversation.isArchived) {
        summary.skippedAlreadyArchived += 1;
        continue;
      }

      const ownerSelfIds = params.ownerSelfIdsByChannel.get(conversation.channelAccountId) ?? new Set<string>();
      const normalizedUsernameConversationExternalId = normalizeUsernameLike(conversation.externalConversationId);

      let hasNumericCounterpart = false;
      let skippedBySelfParticipant = false;
      let matchedCandidate: ArchiveCandidate | null = null;

      for (const participant of conversation.participants) {
        if (participant.isSelf) continue;

        const participantExternalParticipantId = participant.externalParticipantId?.trim() ?? "";
        if (!participantExternalParticipantId) continue;

        if (ownerSelfIds.has(participantExternalParticipantId)) {
          skippedBySelfParticipant = true;
          continue;
        }

        if (!isPurelyNumericId(participantExternalParticipantId)) {
          continue;
        }

        const numericConversation = numericByExternalConversationId.get(participantExternalParticipantId);
        if (!numericConversation || numericConversation.id === conversation.id) {
          continue;
        }

        hasNumericCounterpart = true;

        const sameParticipantLinkedToNumeric =
          conversationIdsByParticipantId.get(participant.id)?.has(numericConversation.id) ?? false;
        if (!sameParticipantLinkedToNumeric) {
          continue;
        }

        if (numericConversation.externalConversationId !== participantExternalParticipantId) {
          continue;
        }

        const participantUsernameNormalized = normalizeUsernameLike(participant.username);
        const hasExactUsernameMatch =
          participantUsernameNormalized.length > 0 &&
          participantUsernameNormalized === normalizedUsernameConversationExternalId;

        // Proof method A is authoritative when a shared non-self participant links both conversations.
        // If username also matches exactly, include that in reason metadata for audit clarity.
        const proofReason: ArchiveReason = "proof_shared_non_self_participant";
        const leadHandlingReason = mapLeadHandling(conversation.leadId, numericConversation.leadId);

        matchedCandidate = {
          usernameConversationId: conversation.id,
          usernameExternalConversationId: conversation.externalConversationId,
          numericConversationId: numericConversation.id,
          numericExternalConversationId: numericConversation.externalConversationId,
          companyId: conversation.companyId,
          channelAccountId: conversation.channelAccountId,
          participantId: participant.id,
          participantExternalParticipantId,
          participantUsername: participant.username,
          usernameConversationLastMessageAt: conversation.lastMessageAt,
          numericConversationLastMessageAt: numericConversation.lastMessageAt,
          usernameConversationLeadId: conversation.leadId,
          numericConversationLeadId: numericConversation.leadId,
          reason: hasExactUsernameMatch
            ? `${proofReason};exact_username_match_through_participant;${leadHandlingReason}`
            : `${proofReason};${leadHandlingReason}`
        };
        break;
      }

      if (matchedCandidate) {
        candidates.push(matchedCandidate);
        summary.eligibleForArchive += 1;
        continue;
      }

      if (skippedBySelfParticipant) {
        summary.skippedSelfParticipant += 1;
        continue;
      }

      if (!hasNumericCounterpart) {
        summary.skippedNoNumericCounterpart += 1;
        continue;
      }

      summary.skippedNoSafeParticipantProof += 1;
    }
  }

  return { candidates, summary };
}

function toConversationSnapshot(row: {
  id: string;
  companyId: string;
  channelAccountId: string;
  externalConversationId: string;
  conversationType: ConversationType;
  isArchived: boolean;
  state: { lastMessageAt: Date | null } | null;
  lead: { id: string } | null;
  participants: Array<{
    participant: {
      id: string;
      externalParticipantId: string;
      username: string | null;
      isSelf: boolean;
    };
  }>;
}): ConversationSnapshot {
  return {
    id: row.id,
    companyId: row.companyId,
    channelAccountId: row.channelAccountId,
    externalConversationId: row.externalConversationId,
    conversationType: row.conversationType,
    isArchived: row.isArchived,
    lastMessageAt: row.state?.lastMessageAt ?? null,
    leadId: row.lead?.id ?? null,
    participants: row.participants.map((p) => ({
      id: p.participant.id,
      externalParticipantId: p.participant.externalParticipantId ?? null,
      username: p.participant.username,
      isSelf: p.participant.isSelf
    }))
  };
}

export async function runArchiveDuplicateDirectConversations(
  prisma: ScriptPrisma,
  opts: Options,
  logger: Logger = console
) {
  if (opts.apply && !opts.companyId) {
    throw new Error("Safety check failed: --apply requires explicit --company-id");
  }

  logger.log(
    `[archive-duplicate-direct-conversations] mode=${opts.apply ? "APPLY" : "DRY-RUN"} companyId=${opts.companyId ?? "ALL"} channelAccountId=${opts.channelAccountId ?? "ALL"}`
  );

  const conversationRows = await prisma.conversation.findMany({
    where: {
      conversationType: "DIRECT",
      ...(opts.companyId ? { companyId: opts.companyId } : {}),
      ...(opts.channelAccountId ? { channelAccountId: opts.channelAccountId } : {})
    },
    select: {
      id: true,
      companyId: true,
      channelAccountId: true,
      externalConversationId: true,
      conversationType: true,
      isArchived: true,
      state: {
        select: {
          lastMessageAt: true
        }
      },
      lead: {
        select: {
          id: true
        }
      },
      participants: {
        select: {
          participant: {
            select: {
              id: true,
              externalParticipantId: true,
              username: true,
              isSelf: true
            }
          }
        }
      }
    }
  });

  const channelAccountIds = [...new Set(conversationRows.map((row) => row.channelAccountId))];
  const telegramRows = channelAccountIds.length
    ? await prisma.telegramAccount.findMany({
        where: { channelAccountId: { in: channelAccountIds } },
        select: { channelAccountId: true, telegramUserId: true }
      })
    : [];

  const ownerSelfIdsByChannel = new Map<string, Set<string>>();
  for (const row of telegramRows) {
    const ids = ownerSelfIdsByChannel.get(row.channelAccountId) ?? new Set<string>();
    ids.add(row.telegramUserId);
    ownerSelfIdsByChannel.set(row.channelAccountId, ids);
  }
  for (const row of conversationRows) {
    const ids = ownerSelfIdsByChannel.get(row.channelAccountId) ?? new Set<string>();
    for (const p of row.participants) {
      if (p.participant.isSelf && p.participant.externalParticipantId) {
        ids.add(p.participant.externalParticipantId);
      }
    }
    ownerSelfIdsByChannel.set(row.channelAccountId, ids);
  }

  const snapshots = conversationRows.map(toConversationSnapshot);
  const plan = buildArchivePlan({
    conversations: snapshots,
    ownerSelfIdsByChannel
  });

  for (const c of plan.candidates) {
    logger.log(
      JSON.stringify({
        usernameConversationId: c.usernameConversationId,
        usernameExternalConversationId: c.usernameExternalConversationId,
        numericConversationId: c.numericConversationId,
        numericExternalConversationId: c.numericExternalConversationId,
        companyId: c.companyId,
        channelAccountId: c.channelAccountId,
        participantId: c.participantId,
        participantExternalParticipantId: c.participantExternalParticipantId,
        participantUsername: c.participantUsername,
        usernameConversationLastMessageAt: c.usernameConversationLastMessageAt?.toISOString() ?? null,
        numericConversationLastMessageAt: c.numericConversationLastMessageAt?.toISOString() ?? null,
        usernameConversationLeadId: c.usernameConversationLeadId,
        numericConversationLeadId: c.numericConversationLeadId,
        reason: c.reason
      })
    );
  }

  logger.log(
    JSON.stringify({
      scannedDirectConversations: plan.summary.scannedDirectConversations,
      usernameLikeCandidates: plan.summary.usernameLikeCandidates,
      eligibleForArchive: plan.summary.eligibleForArchive,
      skippedNoNumericCounterpart: plan.summary.skippedNoNumericCounterpart,
      skippedNoSafeParticipantProof: plan.summary.skippedNoSafeParticipantProof,
      skippedSelfParticipant: plan.summary.skippedSelfParticipant,
      skippedAlreadyArchived: plan.summary.skippedAlreadyArchived
    })
  );

  if (!opts.apply) {
    logger.log("[archive-duplicate-direct-conversations] DRY-RUN: no changes performed");
    return { archivedCount: 0, plan };
  }

  let archivedCount = 0;
  for (const candidate of plan.candidates) {
    await prisma.conversation.update({
      where: { id: candidate.usernameConversationId },
      data: { isArchived: true }
    });
    archivedCount += 1;
  }

  logger.log(`[archive-duplicate-direct-conversations] APPLY complete archived=${archivedCount}`);
  return { archivedCount, plan };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    await runArchiveDuplicateDirectConversations(prisma as unknown as ScriptPrisma, opts);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.includes("archive-duplicate-direct-conversations")) {
  void main().catch((err) => {
    console.error("[archive-duplicate-direct-conversations] failed", err);
    process.exit(1);
  });
}
