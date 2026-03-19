export type RealtimeEvent = {
  type: "message_ingested";
  companyId: string;
  channelAccountId: string;
  conversationId: string;
  messageId: string;
  sentAt: string;
  lastMessagePreview?: string | null;
  conversationTitle?: string | null;
  isOutbound?: boolean;
};

type Listener = (event: RealtimeEvent) => void;

class RealtimeHub {
  private readonly listenersByScope = new Map<string, Set<Listener>>();

  private scopeKey(companyId: string, channelAccountId: string) {
    return `${companyId}:${channelAccountId}`;
  }

  subscribe(companyId: string, channelAccountId: string, listener: Listener): () => void {
    const key = this.scopeKey(companyId, channelAccountId);
    const set = this.listenersByScope.get(key) ?? new Set<Listener>();
    set.add(listener);
    this.listenersByScope.set(key, set);

    return () => {
      const current = this.listenersByScope.get(key);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.listenersByScope.delete(key);
      }
    };
  }

  publish(event: RealtimeEvent) {
    const listeners = this.listenersByScope.get(this.scopeKey(event.companyId, event.channelAccountId));
    if (!listeners || listeners.size === 0) {
      return;
    }

    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // noop: a broken listener must not affect others
      }
    }
  }
}

export const realtimeHub = new RealtimeHub();
