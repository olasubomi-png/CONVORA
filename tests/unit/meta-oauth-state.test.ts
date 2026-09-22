import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createOAuthState, consumeOAuthState } from "@/lib/channels/meta/oauth-state";
import { getMetaPlatformConfig, isMetaPlatformConfigured } from "@/lib/channels/meta/platform-config";
import { setupTestEnv, truncateAllTables } from "../helpers/db";
import { ValidationError } from "@/lib/errors";

beforeAll(() => {
  setupTestEnv();
});

beforeEach(async () => {
  await truncateAllTables();
  delete process.env.META_APP_ID;
  delete process.env.META_APP_SECRET;
});

describe("Meta platform config", () => {
  it("reports not configured when secrets are absent", () => {
    expect(isMetaPlatformConfigured()).toBe(false);
    expect(getMetaPlatformConfig()).toBeNull();
  });

  it("loads config when app id and secret are set", () => {
    process.env.META_APP_ID = "1234567890";
    process.env.META_APP_SECRET = "test_meta_app_secret_value";
    process.env.APP_URL = "https://app.example.com";
    const cfg = getMetaPlatformConfig();
    expect(cfg).not.toBeNull();
    expect(cfg!.appId).toBe("1234567890");
    expect(cfg!.redirectUri).toContain("/api/channels/meta/oauth/callback");
    // Secret exists server-side only; client panels never receive this object.
    expect(cfg!.appSecret).toBe("test_meta_app_secret_value");
  });
});

describe("Meta OAuth state", () => {
  it("issues and consumes a one-time state", async () => {
    const token = await createOAuthState({
      userId: "00000000-0000-4000-8000-000000000001",
      organizationId: "00000000-0000-4000-8000-000000000002",
      provider: "meta_messenger",
    });
    expect(token.length).toBeGreaterThan(16);

    const first = await consumeOAuthState(token);
    expect(first.provider).toBe("meta_messenger");
    expect(first.organizationId).toBe("00000000-0000-4000-8000-000000000002");

    await expect(consumeOAuthState(token)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects unknown state", async () => {
    await expect(consumeOAuthState("not-a-real-state-token-value")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
