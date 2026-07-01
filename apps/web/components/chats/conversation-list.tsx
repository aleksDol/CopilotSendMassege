import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConversationListItemRow } from "./conversation-list-item";
import type { ConversationListItem } from "@/lib/api/types";

export function ConversationList({
  items,
  selectedId,
  onSelect,
  filters,
  onFiltersChange,
  unreadByConversationId = {}
}: {
  items: ConversationListItem[];
  selectedId: string | null;
  onSelect: (conversationId: string) => void;
  filters: { search: string; waitingForReply: string; leadStage: string };
  onFiltersChange: (filters: { search: string; waitingForReply: string; leadStage: string }) => void;
  unreadByConversationId?: Record<string, { lastMessagePreview?: string | null; conversationTitle?: string | null }>;
}) {
  const filtered = items.filter((item) => {
    const searchMatch = filters.search
      ? item.title.toLowerCase().includes(filters.search.toLowerCase()) ||
        (item.lastMessagePreview ?? "").toLowerCase().includes(filters.search.toLowerCase())
      : true;

    const waitingMatch =
      filters.waitingForReply === "all"
        ? true
        : filters.waitingForReply === "true"
          ? item.isWaitingForReply
          : !item.isWaitingForReply;

    const stageMatch = filters.leadStage === "all" ? true : item.leadStage === filters.leadStage;

    return searchMatch && waitingMatch && stageMatch;
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <Input
        placeholder="Поиск чатов"
        value={filters.search}
        onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <Select
          options={[
            { label: "Все", value: "all" },
            { label: "Ждут ответа", value: "true" },
            { label: "Без ожидания", value: "false" }
          ]}
          value={filters.waitingForReply}
          onChange={(event) => onFiltersChange({ ...filters, waitingForReply: event.target.value })}
        />
        <Select
          options={[
            { label: "Любой этап", value: "all" },
            { label: "Новый", value: "new" },
            { label: "Связались", value: "contacted" },
            { label: "Квалифицирован", value: "qualified" },
            { label: "Предложение", value: "proposal" },
            { label: "Переговоры", value: "negotiation" }
          ]}
          value={filters.leadStage}
          onChange={(event) => onFiltersChange({ ...filters, leadStage: event.target.value })}
        />
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {filtered.map((item) => {
          // `unreadByConversationId` is a UI marker stored in localStorage.
          // The red highlight + unread preview should only be shown when the backend
          // considers the conversation as waiting for a reply, otherwise we can render stale markers.
          const hasUnread =
            item.conversationId in unreadByConversationId &&
            item.conversationId !== selectedId &&
            item.isWaitingForReply;
          const unreadData = unreadByConversationId[item.conversationId];
          return (
            <ConversationListItemRow
              key={item.conversationId}
              item={item}
              selected={selectedId === item.conversationId}
              onSelect={() => onSelect(item.conversationId)}
              hasUnread={hasUnread}
              unreadPreview={unreadData?.lastMessagePreview ?? undefined}
            />
          );
        })}
        {filtered.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Чаты не найдены</p> : null}
      </div>
    </div>
  );
}
