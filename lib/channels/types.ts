import type { ConversationChannel } from "@/db/schema";

export type Channel = ConversationChannel;

export type NormalizedAttachment = {
  type: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
};

export type NormalizedExternalIdentity = {
  id: string;
  username?: string;
  address?: string;
};

export type NormalizedInboundMessage = {
  providerMessageId: string;
  externalEventId: string;
  channel: Channel;
  provider: string;
  externalIdentity: NormalizedExternalIdentity;
  text?: string;
  attachments?: NormalizedAttachment[];
  occurredAt: Date;
  metadata?: Record<string, unknown>;
};

export type OutboundMessageContext = {
  organizationId: string;
  conversationId: string;
  messageId: string;
  recipient: {
    externalId: string;
    address?: string;
  };
  body: string;
  attachments?: NormalizedAttachment[];
};

export type OutboundMessageResult = {
  externalMessageId: string;
  raw?: Record<string, unknown>;
};

export type WebhookVerificationResult =
  | { ok: true }
  | { ok: false; reason: string };

export type ChannelHealthResult = {
  healthy: boolean;
  detail?: string;
};

/**
 * Provider-neutral channel adapter contract.
 * Core conversation services must not branch on provider APIs.
 */
export type ChannelAdapter = {
  readonly channel: Channel;
  readonly provider: string;

  verifyWebhook(
    headers: Record<string, string | null>,
    body: string,
  ): Promise<WebhookVerificationResult>;

  parseInbound(
    headers: Record<string, string | null>,
    body: string,
  ): Promise<NormalizedInboundMessage[]>;

  sendMessage(context: OutboundMessageContext): Promise<OutboundMessageResult>;

  healthCheck(): Promise<ChannelHealthResult>;
};
