import { AppError } from "@/lib/errors";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const MAX_RESPONSE_BYTES = 256_000;
const FETCH_TIMEOUT_MS = 15_000;

export type MetaSendTextResult = {
  messageId: string;
  raw: Record<string, unknown>;
};

/**
 * Minimal Graph API client for Messenger / Instagram messaging.
 * Always uses HTTPS graph.facebook.com — never caller-supplied hosts (SSRF-safe).
 */
export class MetaGraphClient {
  constructor(private readonly accessToken: string) {}

  async sendTextMessage(input: {
    recipientId: string;
    text: string;
    /** Page or Instagram business account scoped path; defaults to me */
    path?: string;
  }): Promise<MetaSendTextResult> {
    const path = input.path ?? "me";
    if (!/^[a-zA-Z0-9_.-]+$/.test(path)) {
      throw new AppError("VALIDATION_ERROR", "Invalid Graph path.", 400, true);
    }
    const url = `${GRAPH_BASE}/${path}/messages`;
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
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
