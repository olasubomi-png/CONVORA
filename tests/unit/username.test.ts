import { describe, expect, it } from "vitest";
import {
  isValidUsername,
  normalizeUsername,
  RESERVED_AGENT_USERNAMES,
} from "@/lib/profiles/username";

describe("normalizeUsername", () => {
  it("normalizes display names", () => {
    expect(normalizeUsername("  David Adebayo  ")).toBe("david-adebayo");
  });
});

describe("isValidUsername", () => {
  it("accepts valid usernames", () => {
    expect(isValidUsername("david-adebayo")).toBe(true);
  });
  it("rejects reserved names", () => {
    expect(isValidUsername("admin")).toBe(false);
    expect(RESERVED_AGENT_USERNAMES.has("login")).toBe(true);
  });
  it("rejects invalid formats", () => {
    expect(isValidUsername("A")).toBe(false);
    expect(isValidUsername("David")).toBe(false);
  });
});
