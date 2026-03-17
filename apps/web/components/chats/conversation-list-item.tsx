import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/date";
import type { ConversationListItem } from "@/lib/api/types";

export function ConversationListItemRow({
  item,
  selected,
  onSelect,
  hasUnread = false,
  unreadPreview
}: {
  item: ConversationListItem;
  selected: boolean;
  onSelect: () => void;
  hasUnread?: boolean;
  unreadPreview?: string | null;
}) {
  const preview = hasUnread && (unreadPreview != null && unreadPreview !== "") ? unreadPreview : item.lastMessagePreview;
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition",
        selected ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted",
        hasUnread && !selected && "border-red-500 border-2 bg-red-50/50 dark:bg-red-950/20"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="truncate font-medium">{item.title}</div>
        <div className="text-xs text-muted-foreground">{formatRelativeTime(item.lastMessageAt)}</div>
      </div>
      <p className={cn("mt-1 truncate text-sm", hasUnread && !selected ? "font-medium text-foreground" : "text-muted-foreground")}>
        {preview ?? "No messages yet"}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge variant="outline">{item.leadStage}</Badge>
        <Badge variant="secondary">{item.leadTemperature}</Badge>
        {item.isWaitingForReply ? <Badge variant="warning">waiting</Badge> : null}
        {item.unansweredClientMessageCount > 0 ? (
          <Badge variant="outline">{item.unansweredClientMessageCount} unanswered</Badge>
        ) : null}
      </div>
    </button>
  );
}
