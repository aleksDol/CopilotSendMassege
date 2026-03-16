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
        placeholder="Search chats"
        value={filters.search}
        onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <Select
          options={[
            { label: "All", value: "all" },
            { label: "Waiting", value: "true" },
            { label: "Not waiting", value: "false" }
          ]}
          value={filters.waitingForReply}
          onChange={(event) => onFiltersChange({ ...filters, waitingForReply: event.target.value })}
        />
        <Select
          options={[
            { label: "Any stage", value: "all" },
            { label: "New", value: "new" },
            { label: "Contacted", value: "contacted" },
            { label: "Qualified", value: "qualified" },
            { label: "Proposal", value: "proposal" },
            { label: "Negotiation", value: "negotiation" }
          ]}
          value={filters.leadStage}
          onChange={(event) => onFiltersChange({ ...filters, leadStage: event.target.value })}
        />
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {filtered.map((item) => (
          <ConversationListItemRow
            key={item.conversationId}
            item={item}
            selected={selectedId === item.conversationId}
            onSelect={() => onSelect(item.conversationId)}
          />
        ))}
        {filtered.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No chats found</p> : null}
      </div>
    </div>
  );
}
