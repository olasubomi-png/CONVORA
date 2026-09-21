import type {
  ChannelAdapter,
  NormalizedInboundMessage,
  OutboundMessageContext,
  OutboundMessageResult,
  WebhookVerificationResult,
  ChannelHealthResult,
} from "@/lib/channels/types";
import {
  instagramWebhookSchema,
  type InstagramCredentials,
} from "@/lib/channels/providers/instagram/schemas";
import { verifyMetaSignature256 } from "@/lib/channels/providers/meta/crypto";
import { MetaGraphClient } from "@/lib/channels/providers/meta/graph-client";
import { ValidationError } from "@/lib/errors";

export const INSTAGRAM_MESSAGING_PROVIDER = "instagram_messaging";

export class InstagramMessagingAdapter implements ChannelAdapter {
  readonly channel = "INSTAGRAM" as const;
  readonly provider = INSTAGRAM_MESSAGING_PROVIDER;

  constructor(private readonly credentials: InstagramCredentials) {}

  async verifyWebhook(
    headers: Record<string, string | null>,
    body: string,
  ): Promise<WebhookVerificationResult> {
    return verifyMetaSignature256(
      this.credentials.appSecret,
      body,
      headers["x-hub-signature-256"] ?? null,
    );
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
    const parsed = instagramWebhookSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError("Malformed Instagram webhook payload.");
    }

    const results: NormalizedInboundMessage[] = [];
    for (const entry of parsed.data.entry) {
      if (entry.id !== this.credentials.instagramAccountId) {
        continue;
      }
      for (const event of entry.messaging ?? []) {
        if (event.message?.is_echo) continue;
        if (!event.message) continue;

        const mid = event.message.mid;
        const text = event.message.text?.trim() || undefined;
        const attachments =
          event.message.attachments
            ?.map((a) => ({
              type: a.type,
              url: a.payload?.url,
            }))
            .filter((a) => a.type) ?? [];

        if (!text && attachments.length === 0) continue;

        const ts = event.timestamp
          ? new Date(Number(event.timestamp))
          : new Date();

        results.push({
          providerMessageId: mid,
          externalEventId: `instagram:${mid}`,
          channel: "INSTAGRAM",
          provider: INSTAGRAM_MESSAGING_PROVIDER,
          externalIdentity: { id: event.sender.id },
          text: text ?? (attachments.length ? "[attachment]" : undefined),
          attachments: attachments.length ? attachments : undefined,
          occurredAt: Number.isNaN(ts.getTime()) ? new Date() : ts,
          metadata: {
            instagramAccountId: entry.id,
            recipientId: event.recipient.id,
          },
        });
      }
    }
    return results;
  }

  async sendMessage(
    context: OutboundMessageContext,
  ): Promise<OutboundMessageResult> {
    const client = new MetaGraphClient(this.credentials.pageAccessToken);
    // Messenger API for Instagram: POST /{instagram-user-id}/messages
    // Auth: Page access token of the Page linked to the IG professional account.
    // Path MUST be the Instagram professional account ID — not the Facebook Page ID.
    const result = await client.sendTextMessage({
      recipientId: context.recipient.externalId,
      text: context.body,
      path: this.credentials.instagramAccountId,
    });
    return {
      externalMessageId: result.messageId,
      raw: result.raw,
    };
  }

  async healthCheck(): Promise<ChannelHealthResult> {
    return {
      healthy: Boolean(this.credentials.pageAccessToken),
      detail: "Instagram Messaging adapter credentials present",
    };
  }
}
