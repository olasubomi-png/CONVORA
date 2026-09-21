import { describe, expect, it } from "vitest";
import { roleHasPermission } from "@/lib/authz/permissions";

describe("role permissions", () => {
  it("OWNER has all listed capabilities", () => {
    expect(roleHasPermission("OWNER", "channels.manage")).toBe(true);
    expect(roleHasPermission("OWNER", "automations.manage")).toBe(true);
    expect(roleHasPermission("OWNER", "analytics.export")).toBe(true);
  });

  it("AGENT cannot manage automations or channels", () => {
    expect(roleHasPermission("AGENT", "automations.manage")).toBe(false);
    expect(roleHasPermission("AGENT", "channels.manage")).toBe(false);
    expect(roleHasPermission("AGENT", "members.manage")).toBe(false);
    expect(roleHasPermission("AGENT", "analytics.view")).toBe(true);
    expect(roleHasPermission("AGENT", "analytics.export")).toBe(false);
  });

  it("ADMIN can manage channels but is not superuser beyond matrix", () => {
    expect(roleHasPermission("ADMIN", "channels.manage")).toBe(true);
    expect(roleHasPermission("ADMIN", "members.manage")).toBe(true);
  });
});
