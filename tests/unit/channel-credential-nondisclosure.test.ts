import { describe, expect, it } from "vitest";
import { sanitizeInstallation } from "@/lib/channels/installations";

describe("channel credential non-disclosure", () => {
  it("omits encryptedConfig from sanitized installations", () => {
    const row = {
      id: "00000000-0000-4000-8000-000000000010",
      organizationId: "00000000-0000-4000-8000-000000000011",
      channel: "FACEBOOK",
      provider: "facebook_messenger",
      displayName: "Page",
      status: "ACTIVE" as const,
      providerResourceId: "page_1",
      publicConfig: { pageId: "page_1" },
      encryptedConfig: {
        ciphertext: "v1:iv:super-secret-token-material",
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const publicView = sanitizeInstallation(row);
    expect(publicView).not.toHaveProperty("encryptedConfig");
    expect(JSON.stringify(publicView)).not.toMatch(/ciphertext|super-secret|v1:/i);
    expect(publicView.publicConfig).toEqual({ pageId: "page_1" });
  });
});
