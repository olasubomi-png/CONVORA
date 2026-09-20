/**
 * Rate-limit abstraction.
 *
 * Callers depend only on checkRateLimit / resetRateLimit.
 * Storage is pluggable so Redis (or another shared store) can replace
 * the development in-memory provider without changing auth actions.
 *
 * The default InMemoryRateLimitProvider is process-local and must NOT
 * be treated as distributed protection in multi-instance production.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

export type RateLimitProvider = {
  check(options: RateLimitOptions): Promise<RateLimitResult> | RateLimitResult;
  reset(key?: string): Promise<void> | void;
};

type Bucket = {
  count: number;
  resetAt: number;
};

/**
 * Process-local fixed-window limiter.
 * Suitable for single-process development and unit tests only.
 */
export class InMemoryRateLimitProvider implements RateLimitProvider {
  private readonly store = new Map<string, Bucket>();

  check(options: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    const existing = this.store.get(options.key);

    if (!existing || existing.resetAt <= now) {
      this.store.set(options.key, { count: 1, resetAt: now + options.windowMs });
      return { allowed: true, remaining: options.limit - 1, retryAfterMs: 0 };
    }

    if (existing.count >= options.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, existing.resetAt - now),
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: options.limit - existing.count,
      retryAfterMs: 0,
    };
  }

  reset(key?: string): void {
    if (key) {
      this.store.delete(key);
      return;
    }
    this.store.clear();
  }
}

let provider: RateLimitProvider = new InMemoryRateLimitProvider();

/** Replace the active provider (e.g. tests or future Redis wiring). */
export function setRateLimitProvider(next: RateLimitProvider): void {
  provider = next;
}

export function getRateLimitProvider(): RateLimitProvider {
  return provider;
}

export function checkRateLimit(options: RateLimitOptions): RateLimitResult {
  const result = provider.check(options);
  if (result instanceof Promise) {
    throw new Error(
      "Async rate-limit providers must be awaited via checkRateLimitAsync",
    );
  }
  return result;
}

export async function checkRateLimitAsync(
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  return provider.check(options);
}

export function resetRateLimit(key?: string): void {
  const result = provider.reset(key);
  if (result instanceof Promise) {
    throw new Error("Async rate-limit providers must be awaited via resetRateLimitAsync");
  }
}

export async function resetRateLimitAsync(key?: string): Promise<void> {
  await provider.reset(key);
}

/** @deprecated Use resetRateLimit — kept for existing tests */
export function resetRateLimitStore(): void {
  resetRateLimit();
}
