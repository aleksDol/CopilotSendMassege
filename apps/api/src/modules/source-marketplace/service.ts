import { Prisma, type PrismaClient } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { mapEntry, mapTopic, normalizeTelegramUsername } from "./mappers.js";

const topicInclude = {
  _count: { select: { entries: true } }
} satisfies Prisma.SourceMarketplaceTopicInclude;

const entryInclude = {
  topics: {
    include: {
      topic: { select: { id: true, name: true, slug: true } }
    },
    orderBy: { sortOrder: "asc" as const }
  }
} satisfies Prisma.SourceMarketplaceEntryInclude;

async function syncEntryTopics(prisma: PrismaClient, entryId: string, topicIds: string[]) {
  const uniqueTopicIds = [...new Set(topicIds)];

  if (uniqueTopicIds.length) {
    const found = await prisma.sourceMarketplaceTopic.findMany({
      where: { id: { in: uniqueTopicIds } },
      select: { id: true }
    });
    if (found.length !== uniqueTopicIds.length) {
      throw new AppError(400, "TOPIC_NOT_FOUND", "One or more topics were not found");
    }
  }

  await prisma.$transaction([
    prisma.sourceMarketplaceTopicEntry.deleteMany({ where: { entryId } }),
    ...(uniqueTopicIds.length
      ? [
          prisma.sourceMarketplaceTopicEntry.createMany({
            data: uniqueTopicIds.map((topicId, index) => ({
              topicId,
              entryId,
              sortOrder: index
            }))
          })
        ]
      : [])
  ]);
}

export async function listTopics(
  prisma: PrismaClient,
  query: { status?: "draft" | "active" | "hidden"; search?: string }
) {
  const search = query.search?.trim();
  const rows = await prisma.sourceMarketplaceTopic.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { slug: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } }
            ]
          }
        : {})
    },
    include: topicInclude,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });

  const items = rows.map(mapTopic);
  return { items, total: items.length };
}

export async function createTopic(
  prisma: PrismaClient,
  input: {
    name: string;
    slug: string;
    description?: string | null;
    icon?: string;
    color?: string;
    status?: "draft" | "active" | "hidden";
    sortOrder?: number;
  }
) {
  try {
    const row = await prisma.sourceMarketplaceTopic.create({
      data: {
        name: input.name.trim(),
        slug: input.slug.trim().toLowerCase(),
        description: input.description?.trim() || null,
        icon: input.icon?.trim() ?? "",
        color: input.color?.trim() || "#6366f1",
        status: input.status ?? "draft",
        sortOrder: input.sortOrder ?? 0
      },
      include: topicInclude
    });
    return mapTopic(row);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "TOPIC_SLUG_CONFLICT", "Topic slug already exists");
    }
    throw err;
  }
}

export async function updateTopic(
  prisma: PrismaClient,
  id: string,
  patch: {
    name?: string;
    slug?: string;
    description?: string | null;
    icon?: string;
    color?: string;
    status?: "draft" | "active" | "hidden";
    sortOrder?: number;
  }
) {
  const existing = await prisma.sourceMarketplaceTopic.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, "TOPIC_NOT_FOUND", "Topic not found");
  }

  try {
    const row = await prisma.sourceMarketplaceTopic.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.slug !== undefined ? { slug: patch.slug.trim().toLowerCase() } : {}),
        ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
        ...(patch.icon !== undefined ? { icon: patch.icon.trim() } : {}),
        ...(patch.color !== undefined ? { color: patch.color.trim() || "#6366f1" } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {})
      },
      include: topicInclude
    });
    return mapTopic(row);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "TOPIC_SLUG_CONFLICT", "Topic slug already exists");
    }
    throw err;
  }
}

export async function deleteTopic(prisma: PrismaClient, id: string) {
  const existing = await prisma.sourceMarketplaceTopic.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError(404, "TOPIC_NOT_FOUND", "Topic not found");
  }
  await prisma.sourceMarketplaceTopic.delete({ where: { id } });
  return { ok: true as const };
}

export async function listEntries(
  prisma: PrismaClient,
  query: { status?: "active" | "paused" | "blocked" | "review"; topicId?: string; search?: string }
) {
  const search = query.search?.trim();
  const rows = await prisma.sourceMarketplaceEntry.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.topicId ? { topics: { some: { topicId: query.topicId } } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { telegramUsername: { contains: search, mode: "insensitive" } },
              { telegramChatId: { contains: search, mode: "insensitive" } },
              { note: { contains: search, mode: "insensitive" } }
            ]
          }
        : {})
    },
    include: entryInclude,
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }]
  });

  const items = rows.map(mapEntry);
  return { items, total: items.length };
}

export async function createEntry(
  prisma: PrismaClient,
  input: {
    title: string;
    telegramUsername?: string | null;
    telegramChatId?: string | null;
    chatType?: string | null;
    status?: "active" | "paused" | "blocked" | "review";
    note?: string | null;
    lastCheckedAt?: string | null;
    topicIds?: string[];
  }
) {
  const uniqueTopicIds = [...new Set(input.topicIds ?? [])];

  if (uniqueTopicIds.length) {
    const found = await prisma.sourceMarketplaceTopic.findMany({
      where: { id: { in: uniqueTopicIds } },
      select: { id: true }
    });
    if (found.length !== uniqueTopicIds.length) {
      throw new AppError(400, "TOPIC_NOT_FOUND", "One or more topics were not found");
    }
  }

  const row = await prisma.sourceMarketplaceEntry.create({
    data: {
      title: input.title.trim(),
      telegramUsername: normalizeTelegramUsername(input.telegramUsername),
      telegramChatId: input.telegramChatId?.trim() || null,
      chatType: input.chatType?.trim() || null,
      status: input.status ?? "review",
      note: input.note?.trim() || null,
      lastCheckedAt: input.lastCheckedAt ? new Date(input.lastCheckedAt) : null,
      ...(uniqueTopicIds.length
        ? {
            topics: {
              createMany: {
                data: uniqueTopicIds.map((topicId, index) => ({
                  topicId,
                  sortOrder: index
                }))
              }
            }
          }
        : {})
    },
    include: entryInclude
  });

  return mapEntry(row);
}

export async function updateEntry(
  prisma: PrismaClient,
  id: string,
  patch: {
    title?: string;
    telegramUsername?: string | null;
    telegramChatId?: string | null;
    chatType?: string | null;
    status?: "active" | "paused" | "blocked" | "review";
    note?: string | null;
    lastCheckedAt?: string | null;
    topicIds?: string[];
  }
) {
  const existing = await prisma.sourceMarketplaceEntry.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError(404, "ENTRY_NOT_FOUND", "Catalog entry not found");
  }

  if (patch.topicIds !== undefined) {
    await syncEntryTopics(prisma, id, patch.topicIds);
  }

  const row = await prisma.sourceMarketplaceEntry.update({
    where: { id },
    data: {
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.telegramUsername !== undefined
        ? { telegramUsername: normalizeTelegramUsername(patch.telegramUsername) }
        : {}),
      ...(patch.telegramChatId !== undefined ? { telegramChatId: patch.telegramChatId?.trim() || null } : {}),
      ...(patch.chatType !== undefined ? { chatType: patch.chatType?.trim() || null } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.note !== undefined ? { note: patch.note?.trim() || null } : {}),
      ...(patch.lastCheckedAt !== undefined
        ? { lastCheckedAt: patch.lastCheckedAt ? new Date(patch.lastCheckedAt) : null }
        : {})
    },
    include: entryInclude
  });

  return mapEntry(row);
}

export async function deleteEntry(prisma: PrismaClient, id: string) {
  const existing = await prisma.sourceMarketplaceEntry.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError(404, "ENTRY_NOT_FOUND", "Catalog entry not found");
  }
  await prisma.sourceMarketplaceEntry.delete({ where: { id } });
  return { ok: true as const };
}
