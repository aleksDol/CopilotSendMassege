import type { MessageItem } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/date";

export function MessageThread({ items }: { items: MessageItem[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-4">
      {items.map((message) => (
        <div
          key={message.id}
          className={cn(
            "max-w-[82%] rounded-xl px-3 py-2 text-sm",
            message.direction === "outbound"
              ? "ml-auto bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          )}
        >
          <div>{message.text ?? "(пустое сообщение)"}</div>
          <div className="mt-1 text-[11px] opacity-70">{formatDateTime(message.sentAt)}</div>
        </div>
      ))}
      {items.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">Пока нет сообщений.</div> : null}
    </div>
  );
}
