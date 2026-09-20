import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  channelMessageDeliveries,
  channelInstallations,
  customerChannelIdentities,
  conversations,
  messages,
} from "@/db/schema";
import { getChannelAdapter } from "@/lib/channels/registry";
import { recordAuditEvent } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/db-errors";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * Queue/deliver an internal message via the conversation's channel adapter.
 * Idempotent per messageId (unique delivery row).
 *
 * Semantics: at-most-once attempt coordination in DB; external providers may
 * still receive duplicates if the network fails after send succeeds.
 */
export async function deliverOutboundMessage(input: {
  organizationId: string;
  conversationId: string;
  messageId: string;
}) {
  const db = getDatabase();

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .limit(1);
  if (
    !conversation ||
    conversation.organizationId !== input.organizationId
  ) {
    throw new NotFoundError("Conversation not found.");
  }

  // WEB channel is handled by existing Web Chat path — no external delivery
  if (conversation.channel === "WEB") {
    return { skipped: true as const, reason: "web_channel" };
  }

  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, input.messageId))
    .limit(1);
  if (!message || message.conversationId !== conversation.id) {
    throw new NotFoundError("Message not found.");
  }

  // Find ACTIVE installation for this org+channel
  const [installation] = await db
    .select()
    .from(channelInstallations)
    .where(
      and(
        eq(channelInstallations.organizationId, input.organizationId),
        eq(channelInstallations.channel, conversation.channel),
        eq(channelInstallations.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!installation) {
    throw new ValidationError("No active channel installation for delivery.");
  }

  // Recipient identity
  const [identity] = await db
    .select()
    .from(customerChannelIdentities)
    .where(
      and(
        eq(customerChannelIdentities.organizationId, input.organizationId),
        eq(customerChannelIdentities.customerId, conversation.customerId),
        eq(customerChannelIdentities.channel, conversation.channel),
      ),
    )
    .limit(1);
  if (!identity) {
    throw new ValidationError("No channel identity for recipient.");
  }

  // Create PENDING delivery or return existing
  let deliveryId: string;
  try {
    const [delivery] = await db
      .insert(channelMessageDeliveries)
      .values({
        organizationId: input.organizationId,
        conversationId: conversation.id,
        messageId: message.id,
        installationId: installation.id,
        channel: conversation.channel,
        provider: installation.provider,
        status: "PENDING",
      })
      .returning();
    if (!delivery) throw new Error("Failed to create delivery");
    deliveryId = delivery.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const [existing] = await db
        .select()
        .from(channelMessageDeliveries)
        .where(eq(channelMessageDeliveries.messageId, message.id))
        .limit(1);
      if (existing?.status === "SENT") {
        return { duplicate: true as const, delivery: existing };
      }
      if (existing?.status === "SENDING") {
        return { inProgress: true as const, delivery: existing };
      }
      deliveryId = existing!.id;
    } else {
      throw error;
    }
  }

  // Claim SENDING atomically
  const [claimed] = await db
    .update(channelMessageDeliveries)
    .set({
      status: "SENDING",
      attemptCount: 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(channelMessageDeliveries.id, deliveryId),
        eq(channelMessageDeliveries.status, "PENDING"),
      ),
    )
    .returning();

  if (!claimed) {
    const [current] = await db
      .select()
      .from(channelMessageDeliveries)
      .where(eq(channelMessageDeliveries.id, deliveryId))
      .limit(1);
    return { skipped: true as const, delivery: current };
  }

  try {
    const adapter = getChannelAdapter({
      channel: installation.channel,
      provider: installation.provider,
    });
    const result = await adapter.sendMessage({
      organizationId: input.organizationId,
      conversationId: conversation.id,
      messageId: message.id,
      recipient: {
        externalId: identity.externalUserId,
        address: identity.externalAddress ?? undefined,
      },
      body: message.body,
    });

    const [sent] = await db
      .update(channelMessageDeliveries)
      .set({
        status: "SENT",
        externalMessageId: result.externalMessageId,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(channelMessageDeliveries.id, deliveryId))
      .returning();

    await recordAuditEvent({
      eventType: "CHANNEL_MESSAGE_DELIVERED",
      organizationId: input.organizationId,
      payload: {
        messageId: message.id,
        deliveryId,
        channel: conversation.channel,
        provider: installation.provider,
      },
    });

    return { delivered: true as const, delivery: sent };
  } catch (error) {
    const errMsg =
      error instanceof Error ? error.message.slice(0, 500) : "delivery failed";
    await db
      .update(channelMessageDeliveries)
      .set({
        status: "FAILED",
        lastError: errMsg,
        updatedAt: new Date(),
      })
      .where(eq(channelMessageDeliveries.id, deliveryId));

    await recordAuditEvent({
      eventType: "CHANNEL_MESSAGE_DELIVERY_FAILED",
      organizationId: input.organizationId,
      payload: {
        messageId: message.id,
        deliveryId,
        channel: conversation.channel,
      },
    });

    return { failed: true as const, error: errMsg };
  }
}
