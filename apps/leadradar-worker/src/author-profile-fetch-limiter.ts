type Bucket = {
  windowStartMs: number;
  count: number;
};

export class AuthorProfileFetchLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly params: {
      limitPerMinute: number;
      now?: () => number;
    }
  ) {}

  allow(telegramAccountId: string): boolean {
    const limit = Number.isFinite(this.params.limitPerMinute) && this.params.limitPerMinute > 0
      ? Math.floor(this.params.limitPerMinute)
      : 1;
    const now = this.params.now ? this.params.now() : Date.now();
    const windowMs = 60_000;

    const current = this.buckets.get(telegramAccountId);
    if (!current || now - current.windowStartMs >= windowMs) {
      this.buckets.set(telegramAccountId, { windowStartMs: now, count: 1 });
      return true;
    }

    if (current.count >= limit) {
      return false;
    }

    current.count += 1;
    this.buckets.set(telegramAccountId, current);
    return true;
  }
}
