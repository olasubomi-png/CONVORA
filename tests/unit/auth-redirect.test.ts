import { describe, expect, it } from "vitest";
import { isNextRedirectError } from "@/lib/auth/redirect";
import { AuthenticationError, toPublicError } from "@/lib/errors";

describe("isNextRedirectError", () => {
  it("detects NEXT_REDIRECT digest", () => {
    const err = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/app;307;",
    });
    expect(isNextRedirectError(err)).toBe(true);
  });

  it("rejects ordinary errors", () => {
    expect(isNextRedirectError(new Error("boom"))).toBe(false);
    expect(isNextRedirectError(null)).toBe(false);
  });
});

describe("login public errors", () => {
  it("exposes authentication failures safely", () => {
    const result = toPublicError(
      new AuthenticationError("Invalid email or password."),
    );
    expect(result.statusCode).toBe(401);
    expect(result.payload.error.message).toBe("Invalid email or password.");
  });

  it("hides unexpected errors", () => {
    const result = toPublicError(new Error("ECONNREFUSED 127.0.0.1"));
    expect(result.statusCode).toBe(500);
    expect(result.payload.error.message).toBe("An unexpected error occurred.");
    expect(result.payload.error.message).not.toContain("ECONNREFUSED");
  });
});
