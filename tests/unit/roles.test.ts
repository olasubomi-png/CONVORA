import { describe, expect, it } from "vitest";
import { isAdminRole, roleAtLeast } from "@/lib/authz/roles";

describe("roleAtLeast", () => {
  it("allows OWNER for ADMIN requirements", () => { expect(roleAtLeast("OWNER", "ADMIN")).toBe(true); });
  it("rejects AGENT for ADMIN requirements", () => { expect(roleAtLeast("AGENT", "ADMIN")).toBe(false); });
});
describe("isAdminRole", () => {
  it("treats OWNER and ADMIN as admin roles", () => {
    expect(isAdminRole("OWNER")).toBe(true);
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("AGENT")).toBe(false);
  });
});
