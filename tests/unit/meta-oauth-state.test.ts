import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createOAuthState,
  consumeOAuthState,
  createExpiredOAuthStateForTests,
} from "@/lib/channels/meta/oauth-state";
import {
  getMetaPlatformConfig,
  isMetaPlatformConfigured,
} from "@/lib/channels/meta/platform-config";
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
    expect(cfg!.appSecret).toBe("test_meta_app_secret_value");
  });
});

describe("Meta OAuth state", () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const organizationId = "00000000-0000-4000-8000-000000000002";

  it("issues and consumes a one-time state", async () => {
    const token = await createOAuthState({
      userId,
      organizationId,
      provider: "meta_messenger",
    });
    expect(token.length).toBeGreaterThan(16);

    const first = await consumeOAuthState(token);
    expect(first.provider).toBe("meta_messenger");
    expect(first.organizationId).toBe(organizationId);
    expect(first.userId).toBe(userId);

    await expect(consumeOAuthState(token)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects unknown state", async () => {
    await expect(
      consumeOAuthState("not-a-real-state-token-value"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects expired state", async () => {
    const token = await createExpiredOAuthStateForTests({
      userId,
      organizationId,
      provider: "meta_instagram",
    });
    await expect(consumeOAuthState(token)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("allows only one concurrent consumer to succeed", async () => {
    const token = await createOAuthState({
      userId,
      organizationId,
      provider: "whatsapp_cloud",
    });

    const results = await Promise.allSettled([
      consumeOAuthState(token),
      consumeOAuthState(token),
      consumeOAuthState(token),
      consumeOAuthState(token),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(3);
    if (fulfilled[0]?.status === "fulfilled") {
      expect(fulfilled[0].value.organizationId).toBe(organizationId);
      expect(fulfilled[0].value.provider).toBe("whatsapp_cloud");
    }
  });
});
