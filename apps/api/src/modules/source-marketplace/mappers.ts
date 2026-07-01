import type {
  SourceMarketplaceEntry,
  SourceMarketplaceTopic,
  SourceMarketplaceTopicEntry
} from "@prisma/client";

type TopicWithCount = SourceMarketplaceTopic & {
  _count?: { entries: number };
};

type EntryWithTopics = SourceMarketplaceEntry & {
  topics: (SourceMarketplaceTopicEntry & { topic: Pick<SourceMarketplaceTopic, "id" | "name" | "slug"> })[];
};

export const mapTopic = (row: TopicWithCount) => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  description: row.description,
  icon: row.icon,
  color: row.color,
  status: row.status,
  sort_order: row.sortOrder,
  entry_count: row._count?.entries ?? 0,
  created_at: row.createdAt.toISOString(),
  updated_at: row.updatedAt.toISOString()
});

export const mapEntry = (row: EntryWithTopics) => ({
  id: row.id,
  title: row.title,
  telegram_username: row.telegramUsername,
  telegram_chat_id: row.telegramChatId,
  chat_type: row.chatType,
  status: row.status,
  note: row.note,
  last_checked_at: row.lastCheckedAt?.toISOString() ?? null,
  topic_ids: row.topics.map((t) => t.topicId),
  topics: row.topics.map((t) => ({
    id: t.topic.id,
    name: t.topic.name,
    slug: t.topic.slug
  })),
  created_at: row.createdAt.toISOString(),
  updated_at: row.updatedAt.toISOString()
});

export const normalizeTelegramUsername = (raw: string | null | undefined): string | null => {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^@+/u, "").toLowerCase() || null;
};
