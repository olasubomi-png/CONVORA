import { describe, expect, it } from "vitest";
import { serializeAttributeValue } from "@/lib/customers/attributes";
import { ValidationError } from "@/lib/errors";

describe("boolean attribute validation", () => {
  it("accepts true/false and string true/false", () => {
    expect(serializeAttributeValue("BOOLEAN", true).valueBoolean).toBe("true");
    expect(serializeAttributeValue("BOOLEAN", false).valueBoolean).toBe(
      "false",
    );
    expect(serializeAttributeValue("BOOLEAN", "true").valueBoolean).toBe(
      "true",
    );
    expect(serializeAttributeValue("BOOLEAN", "false").valueBoolean).toBe(
      "false",
    );
  });

  it("rejects coercive non-booleans", () => {
    for (const v of ["yes", "no", "random", 1, 0, {}, []]) {
      expect(() => serializeAttributeValue("BOOLEAN", v)).toThrow(
        ValidationError,
      );
    }
  });
});

describe("select attribute validation", () => {
  it("requires option membership", () => {
    expect(() =>
      serializeAttributeValue("SELECT", "Gold", ["Silver", "Bronze"]),
    ).toThrow(ValidationError);
    expect(
      serializeAttributeValue("SELECT", "Silver", ["Silver", "Bronze"])
        .valueText,
    ).toBe("Silver");
  });
});

describe("text attribute validation", () => {
  it("rejects object and array values", () => {
    expect(() => serializeAttributeValue("TEXT", { a: 1 })).toThrow(
      ValidationError,
    );
    expect(() => serializeAttributeValue("TEXT", [1, 2])).toThrow(
      ValidationError,
    );
  });
});
