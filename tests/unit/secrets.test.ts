import { beforeAll, describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret, encryptJson, decryptJson } from "@/lib/crypto/secrets";
import { resetServerEnvCache } from "@/lib/env";

beforeAll(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ??
    "postgresql://convora:convora@127.0.0.1:5432/convora_test";
  process.env.APP_URL = process.env.APP_URL ?? "http://localhost:3000";
  process.env.CHANNEL_SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");
  resetServerEnvCache();
});

describe("secret encryption", () => {
  it("round-trips plaintext", () => {
    const ct = encryptSecret("hello-secret");
    expect(ct.startsWith("v1:")).toBe(true);
    expect(decryptSecret(ct)).toBe("hello-secret");
  });

  it("uses unique nonces", () => {
    const a = encryptSecret("same");
    const b = encryptSecret("same");
    expect(a).not.toBe(b);
  });

  it("round-trips JSON credentials", () => {
    const obj = { accessToken: "tok", appSecret: "sec" };
    const ct = encryptJson(obj);
    expect(decryptJson(ct)).toEqual(obj);
  });
});
