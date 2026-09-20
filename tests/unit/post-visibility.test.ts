import { describe, expect, it } from "vitest";
import {
  assertValidPostVisibilityTransition,
  nextPublishedAt,
} from "@/lib/posts/visibility";

describe("post visibility transitions", () => {
  it("allows DRAFT → PUBLIC", () => {
    expect(() =>
      assertValidPostVisibilityTransition("DRAFT", "PUBLIC"),
    ).not.toThrow();
  });

  it("allows PUBLIC → ARCHIVED", () => {
    expect(() =>
      assertValidPostVisibilityTransition("PUBLIC", "ARCHIVED"),
    ).not.toThrow();
  });
});

describe("publishedAt policy", () => {
  it("sets publishedAt on first PUBLIC", () => {
    const at = nextPublishedAt("DRAFT", "PUBLIC", null);
    expect(at).toBeInstanceOf(Date);
  });

  it("preserves publishedAt when archiving", () => {
    const original = new Date("2024-01-01T00:00:00Z");
    expect(nextPublishedAt("PUBLIC", "ARCHIVED", original)).toBe(original);
  });

  it("preserves publishedAt on re-publish", () => {
    const original = new Date("2024-01-01T00:00:00Z");
    expect(nextPublishedAt("ARCHIVED", "PUBLIC", original)).toBe(original);
  });
});
