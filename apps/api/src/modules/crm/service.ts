import type { FastifyInstance } from "fastify";
import { ChannelType, type LeadStage, type LeadSource, type LeadStatus } from "@prisma/client";
import { AppError } from "../../lib/errors.js";

type OffsetCursorPayload = { offset: number };

const encodeOffsetCursor = (payload: OffsetCursorPayload): string =>
  Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");

const decodeOffsetCursor = (cursor: string): OffsetCursorPayload => {
  const raw = Buffer.from(cursor, "base64url").toString("utf-8");
  const parsed = JSON.parse(raw) as OffsetCursorPayload;
  if (!parsed || typeof parsed.offset !== "number" || !Number.isFinite(parsed.offset) || parsed.offset < 0) {
    throw new Error("Invalid cursor");
  }
  return { offset: Math.floor(parsed.offset) };
};

export type CrmLeadListItem = {
  leadId: string;
  conversationId: string;
  clientName: string;
  externalConversationId: string | null;
  conversationTitle: string | null;
  conversationType: string | null;
  source: LeadSource;
  status: LeadStatus;
  stage: LeadStage;
  lastMessageAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  account: {
    channelAccountId: string;
    title: string | null;
    status: string;
    sendingEnabled: boolean;
    parsingEnabled: boolean;
    isPrimary: boolean;
  } | null;
};

export async function listCrmLeads(
  app: FastifyInstance,
  params: {
    companyId: string;
    limit: number;
    cursor?: string;
    stage?: LeadStage;
    search?: string;
    channelAccountId?: string;
  }
): Promise<{ items: CrmLeadListItem[]; nextCursor: string | null }> {
  const offset = params.cursor ? decodeOffsetCursor(params.cursor).offset : 0;

  const search = params.search?.trim() ? params.search.trim() : null;
  const requestedChannelAccountId = params.channelAccountId?.trim() ?? null;

  if (requestedChannelAccountId) {
    const account = await app.prisma.channelAccount.findFirst({
      where: {
        id: requestedChannelAccountId,
        companyId: params.companyId,
        channelType: ChannelType.TELEGRAM
      },
      select: { id: true }
    });
    if (!account) {
      throw new AppError(403, "CHANNEL_ACCOUNT_FORBIDDEN", "Channel account does not belong to company");
    }
  }

  // IMPORTANT:
  // Telegram sometimes identifies the same peer by numeric id or by username.
  // That can create multiple DIRECT Conversations for the same peer, which then appear
  // as duplicates in the CRM list. We dedupe DIRECT leads by peer externalParticipantId
  // (ConversationParticipant -> Participant where isSelf=false).
  //
  // Since the API uses offset-cursors, we may need to scan more than `limit` rows to
  // fill a page after deduplication.
  const where: any = {
    companyId: params.companyId,
    ...(params.stage ? { stage: params.stage } : {}),
    conversation: {
      isArchived: false,
      ...(params.channelAccountId ? { channelAccountId: params.channelAccountId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { externalConversationId: { contains: search, mode: "insensitive" } }
            ]
          }
        : {})
    }
  };

  const orderBy: any = [{ conversation: { state: { lastMessageAt: "desc" } } }, { updatedAt: "desc" }, { id: "desc" }];

  const items: CrmLeadListItem[] = [];
  const seenPeerKeys = new Set<string>();

  const batchSize = Math.min(250, Math.max(params.limit * 5, params.limit + 1));
  let scannedOffset = offset;
  let hasMore = true;

  while (items.length < params.limit && hasMore) {
    const rows = await app.prisma.lead.findMany({
      where,
      select: {
        id: true,
        conversationId: true,
        source: true,
        status: true,
        stage: true,
        createdAt: true,
        updatedAt: true,
        conversation: {
          select: {
            title: true,
            externalConversationId: true,
            conversationType: true,
            channelAccount: {
              select: {
                id: true,
                displayName: true,
                status: true,
                sendingEnabled: true,
                parsingEnabled: true,
                isPrimary: true
              }
            },
            state: {
              select: {
                lastMessageAt: true,
                lastInboundAt: true,
                lastOutboundAt: true
              }
            },
            participants: {
              select: {
                participant: {
                  select: {
                    externalParticipantId: true,
                    isSelf: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy,
      skip: scannedOffset,
      take: batchSize
    });

    const batchStartOffset = scannedOffset;
    scannedOffset += rows.length;
    hasMore = rows.length === batchSize;

    let rowsConsumed = 0;
    for (const row of rows) {
      rowsConsumed += 1;
      const title = row.conversation.title ?? null;
      const externalConversationId = row.conversation.externalConversationId ?? null;
      const clientName = title?.trim() || externalConversationId?.trim() || "Без имени";

      const peerExternalParticipantId =
        row.conversation.conversationType === "DIRECT"
          ? row.conversation.participants.find((p) => !p.participant.isSelf)?.participant.externalParticipantId ?? null
          : null;

      const peerKey = peerExternalParticipantId ? `peer:${peerExternalParticipantId}` : null;
      if (peerKey) {
        if (seenPeerKeys.has(peerKey)) continue;
        seenPeerKeys.add(peerKey);
      }

      items.push({
        leadId: row.id,
        conversationId: row.conversationId,
        clientName,
        externalConversationId,
        conversationTitle: title,
        conversationType: row.conversation.conversationType ?? null,
        source: row.source,
        status: row.status,
        stage: row.stage,
        lastMessageAt: row.conversation.state?.lastMessageAt ?? null,
        lastInboundAt: row.conversation.state?.lastInboundAt ?? null,
        lastOutboundAt: row.conversation.state?.lastOutboundAt ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        account: row.conversation.channelAccount
          ? {
              channelAccountId: row.conversation.channelAccount.id,
              title: row.conversation.channelAccount.displayName ?? null,
              status: row.conversation.channelAccount.status,
              sendingEnabled: row.conversation.channelAccount.sendingEnabled,
              parsingEnabled: row.conversation.channelAccount.parsingEnabled,
              isPrimary: row.conversation.channelAccount.isPrimary
            }
          : null
      });

      if (items.length >= params.limit) break;
    }

    // If we stopped early inside the batch (limit reached before exhausting rows),
    // resume from the row where we stopped, not from the end of the full batch.
    if (items.length >= params.limit && rowsConsumed < rows.length) {
      scannedOffset = batchStartOffset + rowsConsumed;
      hasMore = true;
    }
  }

  return {
    items,
    nextCursor: hasMore ? encodeOffsetCursor({ offset: scannedOffset }) : null
  };
}
