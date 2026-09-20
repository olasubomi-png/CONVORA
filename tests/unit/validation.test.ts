import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/errors";
import { parseInput, safeParseInput, z } from "@/lib/validation";

const contactSchema = z.object({
  email: z.string().email(),
});

describe("parseInput", () => {
  it("returns parsed data for valid input", () => {
    const data = parseInput(contactSchema, { email: "ops@example.com" });
    expect(data.email).toBe("ops@example.com");
  });

  it("throws ValidationError for invalid input", () => {
    expect(() => parseInput(contactSchema, { email: "not-an-email" })).toThrow(
      ValidationError,
    );
  });
});

describe("safeParseInput", () => {
  it("does not throw on invalid input", () => {
    const result = safeParseInput(contactSchema, {});
    expect(result.success).toBe(false);
  });
});
