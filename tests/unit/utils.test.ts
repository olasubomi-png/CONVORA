import { describe, expect, it } from "vitest";
import { cn, isNonEmptyString, stripTrailingSlash } from "@/lib/utils";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", undefined, false, "b", null)).toBe("a b");
  });
});

describe("isNonEmptyString", () => {
  it("accepts trimmed non-empty strings", () => {
    expect(isNonEmptyString("convora")).toBe(true);
  });

  it("rejects blank or non-string values", () => {
    expect(isNonEmptyString("   ")).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
    expect(isNonEmptyString(1)).toBe(false);
  });
});

describe("stripTrailingSlash", () => {
  it("removes a single trailing slash", () => {
    expect(stripTrailingSlash("https://convora.example/")).toBe(
      "https://convora.example",
    );
  });

  it("leaves URLs without a trailing slash unchanged", () => {
    expect(stripTrailingSlash("https://convora.example")).toBe(
      "https://convora.example",
    );
  });
});
