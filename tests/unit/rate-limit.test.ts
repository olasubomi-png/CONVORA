import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryRateLimitProvider,
  checkRateLimit,
  resetRateLimit,
  setRateLimitProvider,
} from "@/lib/rate-limit";

describe("rate limit provider", () => {
  beforeEach(() => {
    setRateLimitProvider(new InMemoryRateLimitProvider());
  });

  it("allows requests under the limit", () => {
    const first = checkRateLimit({ key: "t:1", limit: 2, windowMs: 60_000 });
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);
  });

  it("blocks when the limit is exceeded", () => {
    checkRateLimit({ key: "t:2", limit: 1, windowMs: 60_000 });
    const blocked = checkRateLimit({ key: "t:2", limit: 1, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets a single key", () => {
    checkRateLimit({ key: "t:3", limit: 1, windowMs: 60_000 });
    resetRateLimit("t:3");
    const again = checkRateLimit({ key: "t:3", limit: 1, windowMs: 60_000 });
    expect(again.allowed).toBe(true);
  });
});
