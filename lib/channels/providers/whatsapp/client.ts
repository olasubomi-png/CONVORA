import { ValidationError, AppError } from "@/lib/errors";

const GRAPH_API_HOST = "https://graph.facebook.com";
const GRAPH_API_VERSION = "v21.0";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 256_000;

/**
 * Provider-only HTTP client for WhatsApp Cloud API.
 * Fixed Graph endpoint — no user-supplied URLs (SSRF protection).
 */
export class WhatsAppCloudClient {
  constructor(
    private readonly accessToken: string,
    private readonly phoneNumberId: string,
  ) {}

  private endpoint(path: string): string {
    if (!path.startsWith("/")) {
      throw new ValidationError("Invalid WhatsApp API path.");
    }
    return `${GRAPH_API_HOST}/${GRAPH_API_VERSION}${path}`;
  }

  async sendText(to: string, body: string): Promise<{ messageId: string }> {
    const url = this.endpoint(`/${this.phoneNumberId}/messages`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: body.slice(0, 4096) },
        }),
        signal: controller.signal,
      });

      const text = await response.text();
      if (text.length > MAX_RESPONSE_BYTES) {
        throw new AppError(
          "INTERNAL_ERROR",
          "WhatsApp response too large.",
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
          "Invalid WhatsApp API response.",
          502,
          true,
        );
      }

      if (!response.ok) {
        const err = json as { error?: { message?: string; code?: number } };
        const message = err.error?.message ?? "WhatsApp API error";
        throw new AppError(
          "INTERNAL_ERROR",
          message.slice(0, 300),
          response.status === 429 ? 429 : 502,
          true,
          { details: { providerCode: err.error?.code } },
        );
      }

      const data = json as {
        messages?: { id?: string }[];
      };
      const messageId = data.messages?.[0]?.id;
      if (!messageId) {
        throw new AppError(
          "INTERNAL_ERROR",
          "WhatsApp response missing message id.",
          502,
          true,
        );
      }
      return { messageId };
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    const url = this.endpoint(`/${this.phoneNumberId}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.accessToken}` },
        signal: controller.signal,
      });
      if (!response.ok) {
        return { ok: false, detail: `status_${response.status}` };
      }
      return { ok: true };
    } catch {
      return { ok: false, detail: "network_error" };
    } finally {
      clearTimeout(timer);
    }
  }
}
