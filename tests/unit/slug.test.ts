import { describe, expect, it } from "vitest";
import { isValidSlug, normalizeSlug, RESERVED_ORGANIZATION_SLUGS } from "@/lib/orgs/slug";

describe("normalizeSlug", () => {
  it("lowercases and hyphenates", () => { expect(normalizeSlug("  Acme Properties  ")).toBe("acme-properties"); });
});
describe("isValidSlug", () => {
  it("accepts valid slugs", () => { expect(isValidSlug("acme-properties")).toBe(true); });
  it("rejects reserved slugs", () => { expect(isValidSlug("login")).toBe(false); expect(RESERVED_ORGANIZATION_SLUGS.has("app")).toBe(true); });
  it("rejects invalid characters", () => { expect(isValidSlug("Acme")).toBe(false); expect(isValidSlug("a")).toBe(false); });
});
