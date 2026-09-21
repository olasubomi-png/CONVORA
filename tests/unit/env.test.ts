import { describe, expect, it } from "vitest";
import { formatEnvIssues, parseServerEnv } from "@/lib/env";

const valid = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/convora",
  APP_URL: "http://localhost:3000",
  NODE_ENV: "test",
};

describe("parseServerEnv", () => {
  it("accepts a complete Neon-compatible configuration", () => {
    const result = parseServerEnv(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DATABASE_URL).toBe(valid.DATABASE_URL);
      expect(result.data.APP_URL).toBe(valid.APP_URL);
      expect(result.data.NODE_ENV).toBe("test");
    }
  });

  it("accepts postgres:// connection strings", () => {
    const result = parseServerEnv({
      ...valid,
      DATABASE_URL: "postgres://user:pass@localhost:5432/convora",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing DATABASE_URL", () => {
    const result = parseServerEnv({ ...valid, DATABASE_URL: undefined });
    expect(result.success).toBe(false);
  });

  it("rejects a non-postgres DATABASE_URL", () => {
    const result = parseServerEnv({
      ...valid,
      DATABASE_URL: "mysql://localhost/convora",
    });
    expect(result.success).toBe(false);
  });

  it("rejects APP_URL with a trailing slash", () => {
    const result = parseServerEnv({
      ...valid,
      APP_URL: "http://localhost:3000/",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid APP_URL", () => {
    const result = parseServerEnv({ ...valid, APP_URL: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("formats validation issues for operators", () => {
    const result = parseServerEnv({
      DATABASE_URL: "",
      APP_URL: "bad",
      NODE_ENV: "nope",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = formatEnvIssues(result.error);
      expect(message).toContain("DATABASE_URL");
      expect(message).toContain("APP_URL");
    }
  });
});

import { validateProductionEnv } from "@/lib/env";

describe("validateProductionEnv", () => {
  it("requires CHANNEL_SECRETS_KEY in production", () => {
    const issues = validateProductionEnv({
      DATABASE_URL: "postgresql://u:p@h/db",
      APP_URL: "https://app.example.com",
      NODE_ENV: "production",
      OPENAI_MODEL: "gpt-4o-mini",
    });
    expect(issues.some((i) => i.includes("CHANNEL_SECRETS_KEY"))).toBe(true);
  });

  it("accepts valid 32-byte base64 CHANNEL_SECRETS_KEY", () => {
    const key = Buffer.alloc(32, 1).toString("base64");
    const issues = validateProductionEnv({
      DATABASE_URL: "postgresql://u:p@h/db",
      APP_URL: "https://app.example.com",
      NODE_ENV: "production",
      OPENAI_MODEL: "gpt-4o-mini",
      CHANNEL_SECRETS_KEY: key,
    });
    expect(issues).toEqual([]);
  });

  it("rejects wrong-length CHANNEL_SECRETS_KEY", () => {
    const issues = validateProductionEnv({
      DATABASE_URL: "postgresql://u:p@h/db",
      APP_URL: "https://app.example.com",
      NODE_ENV: "production",
      OPENAI_MODEL: "gpt-4o-mini",
      CHANNEL_SECRETS_KEY: Buffer.alloc(16).toString("base64"),
    });
    expect(issues.some((i) => i.includes("32 bytes"))).toBe(true);
  });

  it("requires PAYSTACK_SECRET_KEY when public key is set", () => {
    const key = Buffer.alloc(32, 2).toString("base64");
    const issues = validateProductionEnv({
      DATABASE_URL: "postgresql://u:p@h/db",
      APP_URL: "https://app.example.com",
      NODE_ENV: "production",
      OPENAI_MODEL: "gpt-4o-mini",
      CHANNEL_SECRETS_KEY: key,
      PAYSTACK_PUBLIC_KEY: "pk_live_x",
    });
    expect(issues.some((i) => i.includes("PAYSTACK_SECRET_KEY"))).toBe(true);
  });

  it("does not enforce production rules outside production", () => {
    const issues = validateProductionEnv({
      DATABASE_URL: "postgresql://u:p@h/db",
      APP_URL: "http://localhost:3000",
      NODE_ENV: "development",
      OPENAI_MODEL: "gpt-4o-mini",
    });
    expect(issues).toEqual([]);
  });
});
