export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterMs: number };
type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

export function checkRateLimit(options: { key: string; limit: number; windowMs: number }): RateLimitResult {
  const now = Date.now();
  const existing = store.get(options.key);
  if (!existing || existing.resetAt <= now) {
    store.set(options.key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.limit - 1, retryAfterMs: 0 };
  }
  if (existing.count >= options.limit) {
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, existing.resetAt - now) };
  }
  existing.count += 1;
  return { allowed: true, remaining: options.limit - existing.count, retryAfterMs: 0 };
}

export function resetRateLimitStore(): void {
  store.clear();
}
