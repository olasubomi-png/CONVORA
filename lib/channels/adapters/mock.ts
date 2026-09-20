import type {
  ChannelAdapter,
  NormalizedInboundMessage,
  OutboundMessageContext,
  OutboundMessageResult,
  WebhookVerificationResult,
  ChannelHealthResult,
} from "@/lib/channels/types";
import { ValidationError } from "@/lib/errors";

export type MockAdapterOptions = {
  channel?: NormalizedInboundMessage["channel"];
  provider?: string;
  failSend?: boolean;
  secret?: string;
};

/**
 * Deterministic adapter for integration tests. Not a real provider.
 */
export class MockChannelAdapter implements ChannelAdapter {
  readonly channel: NormalizedInboundMessage["channel"];
  readonly provider: string;
  private readonly failSend: boolean;
  private readonly secret: string;
  readonly sent: OutboundMessageContext[] = [];
  private seq = 0;

  constructor(options: MockAdapterOptions = {}) {
    this.channel = options.channel ?? "WHATSAPP";
    this.provider = options.provider ?? "mock";
    this.failSend = options.failSend ?? false;
    this.secret = options.secret ?? "mock-webhook-secret";
  }

  async verifyWebhook(
    headers: Record<string, string | null>,
    body: string,
  ): Promise<WebhookVerificationResult> {
    void body;
    const sig = headers["x-mock-signature"];
    if (sig !== this.secret) {
      return { ok: false, reason: "invalid_signature" };
    }
    return { ok: true };
  }

  async parseInbound(
    _headers: Record<string, string | null>,
    body: string,
  ): Promise<NormalizedInboundMessage[]> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new ValidationError("Invalid inbound payload.");
    }
    const data = parsed as {
      eventId?: string;
      messageId?: string;
      externalUserId?: string;
      username?: string;
      address?: string;
      text?: string;
      occurredAt?: string;
    };
    if (!data.eventId || !data.messageId || !data.externalUserId) {
      throw new ValidationError("Missing required inbound fields.");
    }
    return [
      {
        providerMessageId: data.messageId,
        externalEventId: data.eventId,
        channel: this.channel,
        provider: this.provider,
        externalIdentity: {
          id: data.externalUserId,
          username: data.username,
          address: data.address,
        },
        text: data.text ?? "",
        occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
      },
    ];
  }

  async sendMessage(
    context: OutboundMessageContext,
  ): Promise<OutboundMessageResult> {
    if (this.failSend) {
      throw new Error("Mock provider send failure");
    }
    this.seq += 1;
    this.sent.push(context);
    return { externalMessageId: `mock-out-${this.seq}` };
  }

  async healthCheck(): Promise<ChannelHealthResult> {
    return { healthy: !this.failSend, detail: this.failSend ? "failing" : "ok" };
  }
}
