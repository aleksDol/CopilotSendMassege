import type { PrismaClient, Prisma } from "@prisma/client";
import { AppError } from "../../../../../lib/errors.js";
import type { Lead } from "../../../domain/entities/lead.js";
import type { LeadRepository } from "../lead-repository.js";
import type {
  CreateLeadInput,
  ExistsByMessageInput,
  FindLeadByIdInput,
  FindLeadFiltersInput,
  UpdateLeadNotesInput,
  UpdateLeadStatusInput
} from "../../../types/repository-inputs.js";
import { leadRadarMappers } from "../../mappers.js";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizePageLimit = (page?: number, limit?: number) => {
  const safeLimit = clamp(Number(limit ?? 20), 1, 100);
  const safePage = clamp(Number(page ?? 1), 1, 10_000);
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit, take: safeLimit };
};

const toOrderBy = (input: FindLeadFiltersInput): Prisma.LeadRadarLeadOrderByWithRelationInput => {
  const sortOrder = input.sortOrder === "asc" ? "asc" : "desc";
  const sortBy = input.sortBy ?? "created_at";
  if (sortBy === "score") return { score: sortOrder };
  if (sortBy === "message_date") return { messageDate: sortOrder };
  return { createdAt: sortOrder };
};

const buildWhere = (input: FindLeadFiltersInput): Prisma.LeadRadarLeadWhereInput => {
  const where: Prisma.LeadRadarLeadWhereInput = {
    userId: input.user_id,
    telegramAccountId: input.telegram_account_id
  };

  if (input.status) {
    where.status = input.status as unknown as never;
  }
  if (input.chat_id) {
    where.chatId = input.chat_id;
  }

  if (input.date_from || input.date_to) {
    where.createdAt = {
      ...(input.date_from ? { gte: input.date_from } : {}),
      ...(input.date_to ? { lte: input.date_to } : {})
    };
  }

  const or: Prisma.LeadRadarLeadWhereInput[] = [];

  if (input.search?.trim()) {
    const q = input.search.trim();
    or.push(
      { username: { contains: q, mode: "insensitive" } },
      { displayName: { contains: q, mode: "insensitive" } },
      { chatTitle: { contains: q, mode: "insensitive" } },
      { messageText: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } }
    );
  }

  if (input.keyword?.trim()) {
    // Minimal, non-business interpretation: filter by message text containing the keyword.
    // Matching against matched_keywords_json will be added later (would require agreed JSON structure).
    const k = input.keyword.trim();
    or.push({ messageText: { contains: k, mode: "insensitive" } });
  }

  if (or.length) {
    where.AND = [{ OR: or }];
  }

  return where;
};

export class PrismaLeadRepository implements LeadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async enrichLeadsWithParticipantData(
    leads: Lead[],
    telegramAccountId: string
  ): Promise<Lead[]> {
    const needEnrichment = leads.filter(
      (l) => (!l.username || !l.display_name) && l.telegram_user_id
    );
    if (!needEnrichment.length) return leads;

    const ta = await this.prisma.telegramAccount.findUnique({
      where: { id: telegramAccountId },
      select: { channelAccountId: true }
    });
    if (!ta) return leads;

    const tgUserIds = [
      ...new Set(needEnrichment.map((l) => l.telegram_user_id!))
    ];
    const participants = await this.prisma.participant.findMany({
      where: {
        channelAccountId: ta.channelAccountId,
        externalParticipantId: { in: tgUserIds }
      },
      select: {
        externalParticipantId: true,
        username: true,
        fullName: true
      }
    });

    const pMap = new Map(
      participants.map((p) => [p.externalParticipantId, p])
    );

    return leads.map((lead) => {
      if ((lead.username && lead.display_name) || !lead.telegram_user_id) return lead;
      const p = pMap.get(lead.telegram_user_id);
      if (!p) return lead;
      return {
        ...lead,
        username: lead.username || p.username || null,
        display_name: lead.display_name || p.fullName || null
      };
    });
  }

  // Ensure context/events include return expected shape
  async createLead(input: CreateLeadInput): Promise<Lead> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.leadRadarLead.create({
        data: {
          userId: input.user_id,
          telegramAccountId: input.telegram_account_id,
          telegramUserId: input.telegram_user_id ?? null,
          username: input.username ?? null,
          displayName: input.display_name ?? null,
          chatId: input.chat_id,
          chatTitle: input.chat_title ?? null,
          sourceType: input.source_type ?? null,
          relatedPostId: input.related_post_id ?? null,
          contextPreview: input.context_preview ?? null,
          messageId: input.message_id,
          messageText: input.message_text ?? null,
          messageDate: input.message_date,
          matchedKeywords: input.matched_keywords_json as Prisma.InputJsonValue,
          score: input.score ?? 0,
          leadType: input.lead_type ?? null,
          status: input.status as unknown as never,
          notes: input.notes ?? null,
          contactedAt: input.contacted_at ?? null
        }
      });

      if (input.context) {
        await tx.leadRadarMessageContext.create({
          data: {
            leadId: created.id,
            beforeMessages: input.context.before_messages_json as Prisma.InputJsonValue,
            afterMessages: input.context.after_messages_json as Prisma.InputJsonValue
          }
        });
      }

      if (input.initial_event) {
        await tx.leadRadarEvent.create({
          data: {
            leadId: created.id,
            eventType: input.initial_event.event_type,
            oldStatus: input.initial_event.old_status ?? null,
            newStatus: input.initial_event.new_status ?? null,
            comment: input.initial_event.comment ?? null,
            createdBy: input.initial_event.created_by ?? null
          }
        });
      }

      return leadRadarMappers.lead(created);
    });
  }

  async findById(input: FindLeadByIdInput) {
    const row = await this.prisma.leadRadarLead.findFirst({
      where: {
        id: input.id,
        userId: input.user_id,
        telegramAccountId: input.telegram_account_id
      },
      include: {
        messageContext: Boolean(input.include?.context),
        events: Boolean(input.include?.events)
          ? { orderBy: { createdAt: "desc" } }
          : false
      }
    });

    if (!row) return null;

    let lead = leadRadarMappers.lead(row);
    if ((!lead.username || !lead.display_name) && lead.telegram_user_id) {
      const [enriched] = await this.enrichLeadsWithParticipantData(
        [lead],
        input.telegram_account_id
      );
      if (enriched) lead = enriched;
    }

    return {
      ...lead,
      context: row.messageContext
        ? {
            before_messages_json: (row.messageContext as any).beforeMessages,
            after_messages_json: (row.messageContext as any).afterMessages,
            created_at: (row.messageContext as any).createdAt
          }
        : undefined,
      events: row.events ?? undefined
    };
  }

  async findByFilters(input: FindLeadFiltersInput) {
    const { page, limit, skip, take } = normalizePageLimit(input.page, input.limit);
    const where = buildWhere(input);
    const orderBy = toOrderBy(input);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.leadRadarLead.count({ where }),
      this.prisma.leadRadarLead.findMany({
        where,
        orderBy,
        skip,
        take
      })
    ]);

    const mapped = rows.map(leadRadarMappers.lead);
    const enriched = await this.enrichLeadsWithParticipantData(
      mapped,
      input.telegram_account_id
    );

    return {
      items: enriched,
      page,
      limit,
      total
    };
  }

  async updateStatus(input: UpdateLeadStatusInput): Promise<Lead> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.leadRadarLead.findFirst({
        where: {
          id: input.lead_id,
          userId: input.user_id,
          telegramAccountId: input.telegram_account_id
        },
        select: { id: true, status: true }
      });

      if (!current) {
        throw new AppError(404, "LEAD_NOT_FOUND", "Lead not found");
      }

      const updated = await tx.leadRadarLead.update({
        where: { id: current.id },
        data: {
          status: input.status as unknown as never
        }
      });

      await tx.leadRadarEvent.create({
        data: {
          leadId: updated.id,
          eventType: "status_updated",
          oldStatus: String(current.status),
          newStatus: String(updated.status),
          comment: input.comment ?? null,
          createdBy: input.created_by ?? null
        }
      });

      return leadRadarMappers.lead(updated);
    });
  }

  async updateNotes(input: UpdateLeadNotesInput): Promise<Lead> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.leadRadarLead.findFirst({
        where: {
          id: input.lead_id,
          userId: input.user_id,
          telegramAccountId: input.telegram_account_id
        },
        select: { id: true, notes: true }
      });

      if (!current) {
        throw new AppError(404, "LEAD_NOT_FOUND", "Lead not found");
      }

      const updated = await tx.leadRadarLead.update({
        where: { id: current.id },
        data: {
          notes: input.notes
        }
      });

      await tx.leadRadarEvent.create({
        data: {
          leadId: updated.id,
          eventType: "note_updated",
          oldStatus: null,
          newStatus: null,
          comment: input.notes,
          createdBy: input.created_by ?? null
        }
      });

      return leadRadarMappers.lead(updated);
    });
  }

  async removeLead(input: { id: string; user_id: string; telegram_account_id: string }): Promise<void> {
    const existing = await this.prisma.leadRadarLead.findFirst({
      where: {
        id: input.id,
        userId: input.user_id,
        telegramAccountId: input.telegram_account_id
      },
      select: { id: true }
    });
    if (!existing) {
      const byIdOnly = await this.prisma.leadRadarLead.findFirst({
        where: { id: input.id },
        select: { id: true, userId: true, telegramAccountId: true }
      });
      if (byIdOnly) {
        throw new AppError(
          403,
          "LEADRADAR_LEAD_SCOPE_MISMATCH",
          `Lead exists but belongs to another scope (expected userId=${input.user_id}, tgAccountId=${input.telegram_account_id}; actual userId=${byIdOnly.userId}, tgAccountId=${byIdOnly.telegramAccountId})`
        );
      }
      throw new AppError(404, "LEADRADAR_LEAD_NOT_FOUND", "Lead not found");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.leadRadarMessageContext.deleteMany({ where: { leadId: existing.id } });
      await tx.leadRadarEvent.deleteMany({ where: { leadId: existing.id } });
      await tx.leadRadarLead.delete({ where: { id: existing.id } });
    });
  }

  async existsByMessage(input: ExistsByMessageInput): Promise<boolean> {
    const row = await this.prisma.leadRadarLead.findFirst({
      where: {
        telegramAccountId: input.telegram_account_id,
        chatId: input.chat_id,
        messageId: input.message_id
      },
      select: { id: true }
    });
    return Boolean(row?.id);
  }

  async existsRecentFromSenderInChat(input: {
    user_id: string;
    telegram_account_id: string;
    chat_id: string;
    telegram_user_id: string;
    since: Date;
  }): Promise<boolean> {
    const row = await this.prisma.leadRadarLead.findFirst({
      where: {
        userId: input.user_id,
        telegramAccountId: input.telegram_account_id,
        chatId: input.chat_id,
        telegramUserId: input.telegram_user_id,
        createdAt: { gte: input.since }
      },
      select: { id: true }
    });
    return Boolean(row?.id);
  }
}

