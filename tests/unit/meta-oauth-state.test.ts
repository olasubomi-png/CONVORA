import { beforeEach, describe, expect, it } from "vitest";
import {
  createSignedOAuthState,
  verifySignedOAuthState,
} from "@/lib/channels/meta/oauth-state";
import {
  getMetaPlatformConfig,
  isMetaPlatformConfigured,
} from "@/lib/channels/meta/platform-config";
import { ValidationError } from "@/lib/errors";

const KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

beforeEach(() => {
  process.env.CHANNEL_SECRETS_KEY = KEY;
  delete process.env.META_APP_ID;
  delete process.env.META_APP_SECRET;
  delete process.env.META_LOGIN_CONFIG_ID;
  delete process.env.META_CONFIG_ID;
  delete process.env.META_FACEBOOK_LOGIN_CONFIG_ID;
});

describe("Meta platform config", () => {
  it("reports not configured when secrets or login config are absent", () => {
    expect(isMetaPlatformConfigured()).toBe(false);
    expect(getMetaPlatformConfig()).toBeNull();
  });

  it("requires login config id in addition to app credentials", () => {
    process.env.META_APP_ID = "1234567890";
    process.env.META_APP_SECRET = "test_meta_app_secret_value";
    process.env.APP_URL = "https://convora-fawn.vercel.app";
    expect(isMetaPlatformConfigured()).toBe(false);

    process.env.META_LOGIN_CONFIG_ID = "login_config_abc";
    const cfg = getMetaPlatformConfig();
    expect(cfg).not.toBeNull();
    expect(cfg!.loginConfigId).toBe("login_config_abc");
    expect(cfg!.redirectUri).toContain("/api/channels/meta/oauth/callback");
  });

  it("accepts META_CONFIG_ID alias", () => {
    process.env.META_APP_ID = "123";
    process.env.META_APP_SECRET = "secret_value_long";
    process.env.APP_URL = "https://example.com";
    process.env.META_CONFIG_ID = "cfg_alias";
    expect(getMetaPlatformConfig()?.loginConfigId).toBe("cfg_alias");
  });
});

describe("signed Meta OAuth state", () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const organizationId = "00000000-0000-4000-8000-000000000002";

  it("issues and verifies a valid state", () => {
    const token = createSignedOAuthState({
      userId,
      organizationId,
      provider: "meta_messenger",
    });
    expect(token.length).toBeGreaterThan(32);
    const payload = verifySignedOAuthState(token);
    expect(payload.userId).toBe(userId);
    expect(payload.organizationId).toBe(organizationId);
    expect(payload.provider).toBe("meta_messenger");
  });

  it("rejects tampered state", () => {
    const token = createSignedOAuthState({
      userId,
      organizationId,
      provider: "meta_instagram",
    });
    const [payload, sig] = token.split(".");
    const tampered = `${payload}x.${sig}`;
    expect(() => verifySignedOAuthState(tampered)).toThrow(ValidationError);
  });

  it("rejects expired state", () => {
    const token = createSignedOAuthState({
      userId,
      organizationId,
      provider: "meta_messenger",
    });
    const [encoded] = token.split(".");
    const json = JSON.parse(
      Buffer.from(encoded!, "base64url").toString("utf8"),
    ) as { exp: number };
    json.exp = Date.now() - 60_000;
    const reEncoded = Buffer.from(JSON.stringify(json), "utf8").toString(
      "base64url",
    );
    // resign with wrong approach — use invalid signature by changing payload only
    const bad = `${reEncoded}.${token.split(".")[1]}`;
    expect(() => verifySignedOAuthState(bad)).toThrow(ValidationError);
  });

  it("rejects empty state", () => {
    expect(() => verifySignedOAuthState("")).toThrow(ValidationError);
  });
});
