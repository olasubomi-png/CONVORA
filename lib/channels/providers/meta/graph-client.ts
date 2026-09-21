import { AppError } from "@/lib/errors";

/**
 * Central Graph API version for all Meta channel providers (Messenger + Instagram).
 * v21.0 is a current Graph API release used by Messenger Platform and
 * Messenger API for Instagram. Bump here only — never per-provider.
 */
export const META_GRAPH_API_VERSION = "v21.0";

const GRAPH_HOST = "https://graph.facebook.com";
const MAX_RESPONSE_BYTES = 256_000;
const FETCH_TIMEOUT_MS = 15_000;

export type MetaSendTextResult = {
  messageId: string;
  raw: Record<string, unknown>;
  /** Absolute URL used (no secrets). Exposed for tests. */
  requestUrl: string;
};

/**
 * Minimal Graph API client for Messenger / Instagram messaging.
 * Always uses HTTPS graph.facebook.com — never caller-supplied hosts (SSRF-safe).
 *
 * Outbound paths (Meta docs):
 * - Facebook Page messaging: POST /{page-id}/messages
 * - Instagram professional messaging: POST /{instagram-user-id}/messages
 *   (Page access token of the linked Page; path is the IG professional account id)
 */
export class MetaGraphClient {
  constructor(private readonly accessToken: string) {}

  async sendTextMessage(input: {
    recipientId: string;
    text: string;
    /**
     * Required Graph node id:
     * - Facebook: Page ID
     * - Instagram: Instagram professional account ID
     */
    path: string;
  }): Promise<MetaSendTextResult> {
    if (!/^[a-zA-Z0-9_.-]+$/.test(input.path)) {
      throw new AppError("VALIDATION_ERROR", "Invalid Graph path.", 400, true);
    }
    const url = `${GRAPH_HOST}/${META_GRAPH_API_VERSION}/${input.path}/messages`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: input.recipientId },
          messaging_type: "RESPONSE",
          message: { text: input.text.slice(0, 2000) },
        }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (text.length > MAX_RESPONSE_BYTES) {
        throw new AppError(
          "INTERNAL_ERROR",
          "Meta API response too large.",
          502,
          true,
        );
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new AppError(
          "INTERNAL_ERROR",
          "Invalid Meta API response.",
          502,
          true,
        );
      }
      if (!response.ok) {
        const err = json as { error?: { message?: string; code?: number } };
        const message = err.error?.message ?? "Meta API error";
        throw new AppError(
          "INTERNAL_ERROR",
          message.slice(0, 300),
          response.status === 429 ? 429 : 502,
          true,
          { details: { providerCode: err.error?.code } },
        );
      }
      const data = json as { message_id?: string };
      if (!data.message_id) {
        throw new AppError(
          "INTERNAL_ERROR",
          "Meta API did not return message_id.",
          502,
          true,
        );
      }
      return {
        messageId: data.message_id,
        raw: data as Record<string, unknown>,
        requestUrl: url,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
