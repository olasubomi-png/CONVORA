import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  ChannelAdapter,
  NormalizedInboundMessage,
  OutboundMessageContext,
  OutboundMessageResult,
  WebhookVerificationResult,
  ChannelHealthResult,
} from "@/lib/channels/types";
import {
  whatsappWebhookSchema,
  whatsappTextMessageSchema,
  whatsappMediaMessageSchema,
  whatsappUnsupportedMessageSchema,
  type WhatsAppCredentials,
} from "@/lib/channels/providers/whatsapp/schemas";
import { WhatsAppCloudClient } from "@/lib/channels/providers/whatsapp/client";
import { ValidationError } from "@/lib/errors";

export const WHATSAPP_CLOUD_PROVIDER = "whatsapp_cloud";

/**
 * WhatsApp Business Platform Cloud API adapter.
 * Provider-specific; Conversation Engine remains neutral.
 */
export class WhatsAppCloudAdapter implements ChannelAdapter {
  readonly channel = "WHATSAPP" as const;
  readonly provider = WHATSAPP_CLOUD_PROVIDER;

  constructor(private readonly credentials: WhatsAppCredentials) {}

  async verifyWebhook(
    headers: Record<string, string | null>,
    body: string,
  ): Promise<WebhookVerificationResult> {
    const signature = headers["x-hub-signature-256"];
    if (!signature || !signature.startsWith("sha256=")) {
      return { ok: false, reason: "missing_signature" };
    }
    const expected =
      "sha256=" +
      createHmac("sha256", this.credentials.appSecret)
        .update(body, "utf8")
        .digest("hex");
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(signature);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return { ok: false, reason: "invalid_signature" };
      }
    } catch {
      return { ok: false, reason: "invalid_signature" };
    }
    return { ok: true };
  }

  async parseInbound(
    _headers: Record<string, string | null>,
    body: string,
  ): Promise<NormalizedInboundMessage[]> {
    if (body.length > 512_000) {
      throw new ValidationError("Webhook payload too large.");
    }
    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      throw new ValidationError("Invalid JSON payload.");
    }
    const parsed = whatsappWebhookSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError("Malformed WhatsApp webhook payload.");
    }

    const results: NormalizedInboundMessage[] = [];
    for (const entry of parsed.data.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        if (!value.messages?.length) continue;
        const phoneNumberId = value.metadata?.phone_number_id;
        if (
          phoneNumberId &&
          phoneNumberId !== this.credentials.phoneNumberId
        ) {
          continue;
        }
        const contactName = value.contacts?.[0]?.profile?.name;

        for (const msgUnknown of value.messages) {
          const text = whatsappTextMessageSchema.safeParse(msgUnknown);
          if (text.success) {
            results.push({
              providerMessageId: text.data.id,
              externalEventId: text.data.id,
              channel: "WHATSAPP",
              provider: this.provider,
              externalIdentity: {
                id: text.data.from,
                username: contactName,
                address: text.data.from,
              },
              text: text.data.text.body,
              occurredAt: new Date(Number(text.data.timestamp) * 1000),
              metadata: { messageType: "text" },
            });
            continue;
          }

          const media = whatsappMediaMessageSchema.safeParse(msgUnknown);
          if (media.success) {
            results.push({
              providerMessageId: media.data.id,
              externalEventId: media.data.id,
              channel: "WHATSAPP",
              provider: this.provider,
              externalIdentity: {
                id: media.data.from,
                username: contactName,
                address: media.data.from,
              },
              text: `[${media.data.type} message]`,
              occurredAt: new Date(Number(media.data.timestamp) * 1000),
              metadata: {
                messageType: media.data.type,
                unsupportedDownload: true,
              },
              attachments: [{ type: media.data.type }],
            });
            continue;
          }

          const other = whatsappUnsupportedMessageSchema.safeParse(msgUnknown);
          if (other.success) {
            results.push({
              providerMessageId: other.data.id,
              externalEventId: other.data.id,
              channel: "WHATSAPP",
              provider: this.provider,
              externalIdentity: {
                id: other.data.from,
                username: contactName,
                address: other.data.from,
              },
              text: `[unsupported: ${other.data.type}]`,
              occurredAt: new Date(Number(other.data.timestamp) * 1000),
              metadata: {
                messageType: other.data.type,
                unsupported: true,
              },
            });
          }
        }
      }
    }
    return results;
  }

  async sendMessage(
    context: OutboundMessageContext,
  ): Promise<OutboundMessageResult> {
    if (context.attachments?.length) {
      throw new ValidationError(
        "WhatsApp media outbound is not supported in this phase.",
      );
    }
    const client = new WhatsAppCloudClient(
      this.credentials.accessToken,
      this.credentials.phoneNumberId,
    );
    const to = context.recipient.externalId || context.recipient.address || "";
    if (!to) {
      throw new ValidationError("Missing WhatsApp recipient.");
    }
    const result = await client.sendText(to, context.body);
    return { externalMessageId: result.messageId };
  }

  async healthCheck(): Promise<ChannelHealthResult> {
    const client = new WhatsAppCloudClient(
      this.credentials.accessToken,
      this.credentials.phoneNumberId,
    );
    const result = await client.healthCheck();
    return {
      healthy: result.ok,
      detail: result.detail,
    };
  }
}

export function verifyWhatsAppChallenge(input: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
  expectedVerifyToken: string;
}): string | null {
  if (input.mode !== "subscribe") return null;
  if (!input.token || input.token !== input.expectedVerifyToken) return null;
  return input.challenge;
}
