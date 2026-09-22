import { describe, expect, it, beforeEach } from "vitest";
import { verifyMetaWebhookChallenge } from "@/lib/channels/meta/webhook-verify";

describe("Meta webhook challenge verification", () => {
  beforeEach(() => {
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
  });

  it("accepts platform verify token when Meta is configured", () => {
    process.env.META_APP_ID = "1234567890";
    process.env.META_APP_SECRET = "test_meta_app_secret_value";
    process.env.APP_URL = "https://app.example.com";
    process.env.META_WEBHOOK_VERIFY_TOKEN = "platform_verify_token_xyz";

    const challenge = verifyMetaWebhookChallenge({
      mode: "subscribe",
      token: "platform_verify_token_xyz",
      challenge: "challenge-123",
      installationVerifyTokens: [],
    });
    expect(challenge).toBe("challenge-123");
  });

  it("rejects wrong verify token", () => {
    process.env.META_APP_ID = "1234567890";
    process.env.META_APP_SECRET = "test_meta_app_secret_value";
    process.env.APP_URL = "https://app.example.com";
    process.env.META_WEBHOOK_VERIFY_TOKEN = "platform_verify_token_xyz";

    const challenge = verifyMetaWebhookChallenge({
      mode: "subscribe",
      token: "wrong",
      challenge: "challenge-123",
      installationVerifyTokens: ["also-wrong"],
    });
    expect(challenge).toBeNull();
  });

  it("accepts installation token when platform token absent", () => {
    const challenge = verifyMetaWebhookChallenge({
      mode: "subscribe",
      token: "install_token",
      challenge: "c-1",
      installationVerifyTokens: ["install_token"],
    });
    expect(challenge).toBe("c-1");
  });
});
