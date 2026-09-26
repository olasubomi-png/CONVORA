import { createHmac } from "node:crypto";
import { describe, expect, it, beforeEach } from "vitest";
import { verifyMetaSignature256 } from "@/lib/channels/providers/meta/crypto";
import { verifyPlatformMetaSignature } from "@/lib/channels/meta/webhook-signature";
import { FacebookMessengerAdapter } from "@/lib/channels/providers/facebook/adapter";
import { InstagramMessagingAdapter } from "@/lib/channels/providers/instagram/adapter";

function sign(body: string, secret: string): string {
  return (
    "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex")
  );
}

const body = JSON.stringify({ object: "page", entry: [{ id: "1" }] });
const secret = "meta_app_secret_value_12";

describe("verifyMetaSignature256", () => {
  it("accepts a valid signature", () => {
    expect(verifyMetaSignature256(secret, body, sign(body, secret))).toEqual({
      ok: true,
    });
  });

  it("rejects a missing signature", () => {
    expect(verifyMetaSignature256(secret, body, null)).toEqual({
      ok: false,
      reason: "missing_signature",
    });
  });

  it("rejects an invalid signature", () => {
    expect(
      verifyMetaSignature256(secret, body, "sha256=deadbeef"),
    ).toMatchObject({ ok: false, reason: "invalid_signature" });
  });

  it("rejects a modified payload", () => {
    const sig = sign(body, secret);
    expect(verifyMetaSignature256(secret, body + " ", sig)).toMatchObject({
      ok: false,
      reason: "invalid_signature",
    });
  });

  it("rejects signature produced with the wrong secret", () => {
    expect(
      verifyMetaSignature256(secret, body, sign(body, "wrong_secret_value_xx")),
    ).toMatchObject({ ok: false, reason: "invalid_signature" });
  });
});

describe("verifyPlatformMetaSignature", () => {
  beforeEach(() => {
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    delete process.env.META_LOGIN_CONFIG_ID;
  });

  it("is not required when Meta platform is unconfigured", () => {
    expect(verifyPlatformMetaSignature(body, sign(body, secret))).toEqual({
      required: false,
    });
  });

  it("requires and accepts valid platform signature", () => {
    process.env.META_APP_ID = "123";
    process.env.META_APP_SECRET = secret;
    process.env.META_LOGIN_CONFIG_ID = "login_cfg_test";
    process.env.APP_URL = "https://app.example.com";
    expect(verifyPlatformMetaSignature(body, sign(body, secret))).toEqual({
      required: true,
      ok: true,
    });
  });

  it("requires and rejects invalid platform signature", () => {
    process.env.META_APP_ID = "123";
    process.env.META_APP_SECRET = secret;
    process.env.META_LOGIN_CONFIG_ID = "login_cfg_test";
    process.env.APP_URL = "https://app.example.com";
    expect(
      verifyPlatformMetaSignature(body, sign(body, "other")),
    ).toMatchObject({ required: true, ok: false });
  });
});

describe("adapter signature + Instagram id isolation", () => {
  it("Facebook adapter rejects missing signature before parse", async () => {
    const adapter = new FacebookMessengerAdapter({
      pageAccessToken: "token_value_long_enough_12",
      appSecret: secret,
      verifyToken: "verify_token_12",
      pageId: "page_1",
    });
    expect((await adapter.verifyWebhook({}, body)).ok).toBe(false);
  });

  it("Instagram adapter ignores Page-id entry; requires IG professional id", async () => {
    const adapter = new InstagramMessagingAdapter({
      pageAccessToken: "token_value_long_enough_12",
      appSecret: secret,
      verifyToken: "verify_token_12",
      instagramAccountId: "ig_professional_99",
      pageId: "page_should_not_match_entry",
    });

    const wrongEntry = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: "page_should_not_match_entry",
          messaging: [
            {
              sender: { id: "u1" },
              recipient: { id: "page_should_not_match_entry" },
              timestamp: Date.now(),
              message: { mid: "m1", text: "hi" },
            },
          ],
        },
      ],
    });
    expect(
      (
        await adapter.verifyWebhook(
          { "x-hub-signature-256": sign(wrongEntry, secret) },
          wrongEntry,
        )
      ).ok,
    ).toBe(true);
    expect(await adapter.parseInbound({}, wrongEntry)).toHaveLength(0);

    const correct = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: "ig_professional_99",
          messaging: [
            {
              sender: { id: "u1" },
              recipient: { id: "ig_professional_99" },
              timestamp: Date.now(),
              message: { mid: "m2", text: "hello ig" },
            },
          ],
        },
      ],
    });
    const parsed = await adapter.parseInbound({}, correct);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.channel).toBe("INSTAGRAM");
    expect(parsed[0]!.metadata?.instagramAccountId).toBe("ig_professional_99");
  });
});
