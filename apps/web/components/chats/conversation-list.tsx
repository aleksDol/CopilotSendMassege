import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConversationListItemRow } from "./conversation-list-item";
import type { ConversationListItem } from "@/lib/api/types";

export function ConversationList({
  items,
  selectedId,
  onSelect,
  filters,
  onFiltersChange
}: {
  items: ConversationListItem[];
  selectedId: string | null;
  onSelect: (conversationId: string) => void;
  filters: { search: string; waitingForReply: string; leadStage: string };
  onFiltersChange: (filters: { search: string; waitingForReply: string; leadStage: string }) => void;
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
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Input
        placeholder="Поиск диалогов"
        value={filters.search}
        onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <Select
          options={[
            { label: "Все", value: "all" },
            { label: "Ожидают ответа", value: "true" },
            { label: "Не ожидают", value: "false" }
          ]}
          value={filters.waitingForReply}
          onChange={(event) => onFiltersChange({ ...filters, waitingForReply: event.target.value })}
        />
        <Select
          options={[
            { label: "Любой этап", value: "all" },
            { label: "новый", value: "new" },
            { label: "контакт", value: "contacted" },
            { label: "квалифицирован", value: "qualified" },
            { label: "предложение", value: "proposal" },
            { label: "переговоры", value: "negotiation" }
          ]}
          value={filters.leadStage}
          onChange={(event) => onFiltersChange({ ...filters, leadStage: event.target.value })}
        />
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {filtered.map((item) => (
          <ConversationListItemRow
            key={item.conversationId}
            item={item}
            selected={selectedId === item.conversationId}
            onSelect={() => onSelect(item.conversationId)}
          />
        ))}
        {filtered.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Нет диалогов</p> : null}
      </div>
    </div>
  );
}
