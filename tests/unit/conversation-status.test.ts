import { describe, expect, it } from "vitest";
import { assertValidStatusTransition } from "@/lib/conversations/status";
import { ValidationError } from "@/lib/errors";

describe("conversation status transitions", () => {
  it("allows OPEN → CLOSED", () => {
    expect(() => assertValidStatusTransition("OPEN", "CLOSED")).not.toThrow();
  });
  it("allows CLOSED → OPEN", () => {
    expect(() => assertValidStatusTransition("CLOSED", "OPEN")).not.toThrow();
  });
  it("rejects CLOSED → PENDING", () => {
    expect(() => assertValidStatusTransition("CLOSED", "PENDING")).toThrow(
      ValidationError,
    );
  });
});
