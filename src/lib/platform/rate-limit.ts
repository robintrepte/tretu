/**
 * In-memory token buckets (one Next.js process per host, PM2 fork mode). Good enough to stop a
 * runaway client; not a security boundary.
 */
type Bucket = { tokens: number; updatedAt: number };

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly perMinute: () => number,
    private readonly burst: () => number
  ) {}

  /** Takes `cost` tokens; returns seconds to wait when limited, 0 when allowed. */
  take(key: string, cost = 1, now = Date.now()): number {
    const rate = Math.max(1, this.perMinute()) / 60_000;
    const capacity = Math.max(1, this.burst());
    const bucket = this.buckets.get(key) ?? { tokens: capacity, updatedAt: now };
    bucket.tokens = Math.min(capacity, bucket.tokens + (now - bucket.updatedAt) * rate);
    bucket.updatedAt = now;
    if (bucket.tokens < cost) {
      this.buckets.set(key, bucket);
      return Math.max(1, Math.ceil((cost - bucket.tokens) / rate / 1000));
    }
    bucket.tokens -= cost;
    this.buckets.set(key, bucket);
    if (this.buckets.size > 10_000) this.prune(now);
    return 0;
  }

  reset(): void {
    this.buckets.clear();
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updatedAt > 10 * 60_000) this.buckets.delete(key);
    }
  }
}
