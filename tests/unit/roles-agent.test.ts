import { describe, expect, it } from "vitest";
import { canHoldAgentProfile, isAdminRole } from "@/lib/authz/roles";

describe("canHoldAgentProfile", () => {
  it("allows OWNER, ADMIN, and AGENT", () => {
    expect(canHoldAgentProfile("OWNER")).toBe(true);
    expect(canHoldAgentProfile("ADMIN")).toBe(true);
    expect(canHoldAgentProfile("AGENT")).toBe(true);
  });
});

describe("isAdminRole", () => {
  it("excludes AGENT", () => {
    expect(isAdminRole("AGENT")).toBe(false);
    expect(isAdminRole("ADMIN")).toBe(true);
  });
});
