export type RealtimeEvent = {
  type: "message_ingested";
  companyId: string;
  conversationId: string;
  messageId: string;
  sentAt: string;
  lastMessagePreview?: string | null;
  conversationTitle?: string | null;
};

type Listener = (event: RealtimeEvent) => void;

class RealtimeHub {
  private readonly listenersByCompany = new Map<string, Set<Listener>>();

  subscribe(companyId: string, listener: Listener): () => void {
    const set = this.listenersByCompany.get(companyId) ?? new Set<Listener>();
    set.add(listener);
    this.listenersByCompany.set(companyId, set);

    return () => {
      const current = this.listenersByCompany.get(companyId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.listenersByCompany.delete(companyId);
      }
    };
  }

  publish(event: RealtimeEvent) {
    const listeners = this.listenersByCompany.get(event.companyId);
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
