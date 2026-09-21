import { describe, expect, it } from "vitest";
import { classifyError } from "@/lib/observability/classify-error";

describe("classifyError", () => {
  it("classifies postgres missing relation", () => {
    const err = Object.assign(new Error('relation "users" does not exist'), {
      code: "42P01",
    });
    const d = classifyError(err);
    expect(d.subsystem).toBe("database_missing_relation");
    expect(d.code).toBe("42P01");
  });

  it("classifies argon2 failures", () => {
    const err = new Error("argon2: Module did not self-register");
    expect(classifyError(err).subsystem).toBe("password_hashing");
  });

  it("does not leak connection strings in snippets", () => {
    const err = new Error("connect postgresql://user:pass@host/db failed");
    const d = classifyError(err);
    expect(d.messageSnippet).toBeUndefined();
  });
});
