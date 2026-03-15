import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/date";
import type { ConversationListItem } from "@/lib/api/types";

export function ConversationListItemRow({
  item,
  selected,
  onSelect
}: {
  item: ConversationListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition",
        selected ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="truncate font-medium">{item.title}</div>
        <div className="text-xs text-muted-foreground">{formatRelativeTime(item.lastMessageAt)}</div>
      </div>
      <p className="mt-1 truncate text-sm text-muted-foreground">{item.lastMessagePreview ?? "Пока нет сообщений"}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge variant="outline">{item.leadStage}</Badge>
        <Badge variant="secondary">{item.leadTemperature}</Badge>
        {item.isWaitingForReply ? <Badge variant="warning">ожидает</Badge> : null}
        {item.unansweredClientMessageCount > 0 ? (
          <Badge variant="outline">{item.unansweredClientMessageCount} непрочитанных</Badge>
        ) : null}
      </div>
    </button>
  );
}
