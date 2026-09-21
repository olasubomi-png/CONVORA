import type {
  ChannelAdapter,
  NormalizedInboundMessage,
  OutboundMessageContext,
  OutboundMessageResult,
  WebhookVerificationResult,
  ChannelHealthResult,
} from "@/lib/channels/types";
import {
  facebookWebhookSchema,
  type FacebookCredentials,
} from "@/lib/channels/providers/facebook/schemas";
import { verifyMetaSignature256 } from "@/lib/channels/providers/meta/crypto";
import { MetaGraphClient } from "@/lib/channels/providers/meta/graph-client";
import { ValidationError } from "@/lib/errors";

export const FACEBOOK_MESSENGER_PROVIDER = "facebook_messenger";

export class FacebookMessengerAdapter implements ChannelAdapter {
  readonly channel = "FACEBOOK" as const;
  readonly provider = FACEBOOK_MESSENGER_PROVIDER;

  constructor(private readonly credentials: FacebookCredentials) {}

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
    const parsed = facebookWebhookSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError("Malformed Facebook webhook payload.");
    }

    const results: NormalizedInboundMessage[] = [];
    for (const entry of parsed.data.entry) {
      if (entry.id !== this.credentials.pageId) {
        // Not for this installation's page
        continue;
      }
      for (const event of entry.messaging ?? []) {
        if (event.message?.is_echo) continue;
        if (!event.message) {
          // postbacks and other events — skip unsupported for now
          continue;
        }
        const mid = event.message.mid;
        const text = event.message.text?.trim() || undefined;
        const attachments =
          event.message.attachments
            ?.map((a) => ({
              type: a.type,
              url: a.payload?.url,
            }))
            .filter((a) => a.type) ?? [];

        if (!text && attachments.length === 0) {
          continue;
        }

        const ts = event.timestamp
          ? new Date(Number(event.timestamp))
          : new Date();

        results.push({
          providerMessageId: mid,
          externalEventId: `facebook:${mid}`,
          channel: "FACEBOOK",
          provider: FACEBOOK_MESSENGER_PROVIDER,
          externalIdentity: { id: event.sender.id },
          text: text ?? (attachments.length ? "[attachment]" : undefined),
          attachments: attachments.length ? attachments : undefined,
          occurredAt: Number.isNaN(ts.getTime()) ? new Date() : ts,
          metadata: {
            pageId: entry.id,
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
    const result = await client.sendTextMessage({
      recipientId: context.recipient.externalId,
      text: context.body,
      path: this.credentials.pageId,
    });
    return {
      externalMessageId: result.messageId,
      raw: result.raw,
    };
  }

  async healthCheck(): Promise<ChannelHealthResult> {
    return {
      healthy: Boolean(this.credentials.pageAccessToken),
      detail: "Facebook Messenger adapter credentials present",
    };
  }
}
