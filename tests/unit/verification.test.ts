import { describe, expect, it } from "vitest";
import { assertValidVerificationTransition } from "@/lib/profiles/verification";

describe("verification transitions", () => {
  it("allows UNVERIFIED → VERIFIED", () => {
    expect(() =>
      assertValidVerificationTransition("UNVERIFIED", "VERIFIED"),
    ).not.toThrow();
  });

  it("allows VERIFIED → SUSPENDED", () => {
    expect(() =>
      assertValidVerificationTransition("VERIFIED", "SUSPENDED"),
    ).not.toThrow();
  });

  it("rejects same-state as no-op", () => {
    expect(() =>
      assertValidVerificationTransition("VERIFIED", "VERIFIED"),
    ).not.toThrow();
  });
});
