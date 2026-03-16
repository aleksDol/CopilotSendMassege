"use client";

import { useEffect, useMemo, useRef } from "react";
import type { MessageItem } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/date";

export function MessageThread({ items }: { items: MessageItem[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ordered = useMemo(() => [...items].reverse(), [items]);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [ordered.length]);

  return (
    <div ref={containerRef} className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-4">
      {ordered.map((message) => (
        <div
          key={message.id}
          className={cn(
            "max-w-[82%] rounded-xl px-3 py-2 text-sm",
            message.direction === "outbound" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted text-foreground"
          )}
        >
          <div>{message.text ?? "(empty message)"}</div>
          <div className="mt-1 text-[11px] opacity-70">{formatDateTime(message.sentAt)}</div>
        </div>
      ))}
      {ordered.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">No messages yet.</div> : null}
    </div>
  );
}
