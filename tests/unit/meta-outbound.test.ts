import { afterEach, describe, expect, it, vi } from "vitest";
import { FacebookMessengerAdapter } from "@/lib/channels/providers/facebook/adapter";
import { InstagramMessagingAdapter } from "@/lib/channels/providers/instagram/adapter";
import { META_GRAPH_API_VERSION } from "@/lib/channels/providers/meta/graph-client";
import { AppError } from "@/lib/errors";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetchOk(messageId: string) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ message_id: messageId, _url: url }),
    } as Response;
  }) as typeof fetch;
}

function mockFetchFail(status: number, message: string) {
  globalThis.fetch = vi.fn(async () => {
    return {
      ok: false,
      status,
      text: async () =>
        JSON.stringify({ error: { message, code: status } }),
    } as Response;
  }) as typeof fetch;
}

const baseCtx = {
  organizationId: "00000000-0000-0000-0000-000000000001",
  conversationId: "00000000-0000-0000-0000-000000000002",
  messageId: "00000000-0000-0000-0000-000000000003",
  recipient: { externalId: "recipient_ext_1" },
  body: "Hello",
};

describe("Meta outbound paths", () => {
  it("Facebook outbound uses Page ID path, not Instagram account id", async () => {
    mockFetchOk("mid.fb.1");
    const adapter = new FacebookMessengerAdapter({
      pageAccessToken: "EAAB_fb_token_secret_value_12",
      appSecret: "fb_secret_12",
      verifyToken: "fb_verify_12",
      pageId: "page_111",
    });
    const result = await adapter.sendMessage(baseCtx);
    expect(result.externalMessageId).toBe("mid.fb.1");
    expect(globalThis.fetch).toHaveBeenCalled();
    const calledUrl = String(vi.mocked(globalThis.fetch).mock.calls[0]![0]);
    expect(calledUrl).toBe(
      `https://graph.facebook.com/${META_GRAPH_API_VERSION}/page_111/messages`,
    );
    expect(calledUrl).not.toContain("ig_");
    // Authorization header must not leak into returned result
    expect(JSON.stringify(result)).not.toContain("EAAB_fb_token_secret_value_12");
  });

  it("Instagram outbound uses Instagram professional account ID, not Page ID", async () => {
    mockFetchOk("mid.ig.1");
    const adapter = new InstagramMessagingAdapter({
      pageAccessToken: "EAAB_ig_token_secret_value_12",
      appSecret: "ig_secret_12",
      verifyToken: "ig_verify_12",
      instagramAccountId: "ig_account_999",
      pageId: "page_should_not_be_path",
    });
    const result = await adapter.sendMessage(baseCtx);
    expect(result.externalMessageId).toBe("mid.ig.1");
    const calledUrl = String(vi.mocked(globalThis.fetch).mock.calls[0]![0]);
    expect(calledUrl).toBe(
      `https://graph.facebook.com/${META_GRAPH_API_VERSION}/ig_account_999/messages`,
    );
    expect(calledUrl).not.toContain("page_should_not_be_path");
    expect(calledUrl).not.toMatch(/\/me\/messages/);
    expect(JSON.stringify(result)).not.toContain("EAAB_ig_token_secret_value_12");
  });

  it("does not cross-use Facebook page path for Instagram credentials", async () => {
    mockFetchOk("mid.x");
    const fb = new FacebookMessengerAdapter({
      pageAccessToken: "EAAB_only_fb_token_xxxxxxxxxxxx",
      appSecret: "sec_fb",
      verifyToken: "tok_fb",
      pageId: "page_only_fb",
    });
    const ig = new InstagramMessagingAdapter({
      pageAccessToken: "EAAB_only_ig_token_xxxxxxxxxxxx",
      appSecret: "sec_ig",
      verifyToken: "tok_ig",
      instagramAccountId: "ig_only_ig",
      pageId: "page_linked_but_not_path",
    });
    await fb.sendMessage(baseCtx);
    const fbUrl = String(vi.mocked(globalThis.fetch).mock.calls[0]![0]);
    await ig.sendMessage(baseCtx);
    const igUrl = String(vi.mocked(globalThis.fetch).mock.calls[1]![0]);
    expect(fbUrl).toContain("/page_only_fb/messages");
    expect(igUrl).toContain("/ig_only_ig/messages");
    expect(fbUrl).not.toEqual(igUrl);
  });

  it("surfaces provider failure without throwing secrets", async () => {
    mockFetchFail(400, "Invalid OAuth access token");
    const adapter = new InstagramMessagingAdapter({
      pageAccessToken: "EAAB_fail_token_secret_zzzz",
      appSecret: "sec",
      verifyToken: "tok",
      instagramAccountId: "ig_fail",
    });
    await expect(adapter.sendMessage(baseCtx)).rejects.toBeInstanceOf(AppError);
    try {
      await adapter.sendMessage(baseCtx);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).not.toContain("EAAB_fail_token_secret_zzzz");
    }
  });
});
