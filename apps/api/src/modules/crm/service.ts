import type { FastifyInstance } from "fastify";
import type { LeadStage, LeadSource, LeadStatus } from "@prisma/client";

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
};

export async function listCrmLeads(
  app: FastifyInstance,
  params: {
    companyId: string;
    limit: number;
    cursor?: string;
    stage?: LeadStage;
    search?: string;
  }
): Promise<{ items: CrmLeadListItem[]; nextCursor: string | null }> {
  const offset = params.cursor ? decodeOffsetCursor(params.cursor).offset : 0;

  const search = params.search?.trim() ? params.search.trim() : null;

  const rows = await app.prisma.lead.findMany({
    where: {
      companyId: params.companyId,
      ...(params.stage ? { stage: params.stage } : {}),
      ...(search
        ? {
            conversation: {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { externalConversationId: { contains: search, mode: "insensitive" } }
              ]
            }
          }
        : {})
    },
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
          state: {
            select: {
              lastMessageAt: true,
              lastInboundAt: true,
              lastOutboundAt: true
            }
          }
        }
      }
    },
    orderBy: [{ conversation: { state: { lastMessageAt: "desc" } } }, { updatedAt: "desc" }, { id: "desc" }],
    skip: offset,
    take: params.limit + 1
  });

  const hasNext = rows.length > params.limit;
  const page = rows.slice(0, params.limit);

  const items: CrmLeadListItem[] = page.map((row) => {
    const title = row.conversation.title ?? null;
    const externalConversationId = row.conversation.externalConversationId ?? null;
    const clientName = title?.trim() || externalConversationId?.trim() || "Без имени";
    return {
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
      updatedAt: row.updatedAt
    };
  });

  return {
    items,
    nextCursor: hasNext ? encodeOffsetCursor({ offset: offset + params.limit }) : null
  };
}

