import { describe, expect, it } from "vitest";
import { hashPassword, validatePasswordPolicy, verifyPassword } from "@/lib/auth/password";

describe("password policy", () => {
  it("rejects short passwords", () => { expect(validatePasswordPolicy("Ab1")).toMatch(/at least/); });
  it("rejects passwords without a number", () => { expect(validatePasswordPolicy("abcdefghij")).toMatch(/letter and one number/); });
  it("accepts a valid password", () => { expect(validatePasswordPolicy("securepass1")).toBeNull(); });
});

describe("password hashing", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("securepass1");
    expect(hash).not.toContain("securepass1");
    expect(await verifyPassword(hash, "securepass1")).toBe(true);
    expect(await verifyPassword(hash, "wrongpass99")).toBe(false);
  });
});
