import { describe, expect, it } from "vitest";
import {
  TRIAL_DURATION_DAYS,
  TRIAL_DURATION_MS,
} from "@/lib/billing/constants";
import { isSubscriptionEntitled } from "@/lib/billing/subscriptions";

describe("trial duration constant", () => {
  it("is exactly 90 days", () => {
    expect(TRIAL_DURATION_DAYS).toBe(90);
    expect(TRIAL_DURATION_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it("entitlement window uses trialEndsAt, not client claims", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const end = new Date(start.getTime() + TRIAL_DURATION_MS);
    expect(
      isSubscriptionEntitled("TRIALING", end, new Date(end.getTime() - 1)),
    ).toBe(true);
    expect(
      isSubscriptionEntitled("TRIALING", end, new Date(end.getTime())),
    ).toBe(false);
    expect(
      isSubscriptionEntitled("TRIALING", end, new Date(end.getTime() + 1)),
    ).toBe(false);
  });
});
