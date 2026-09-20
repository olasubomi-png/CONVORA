import { createHash } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  channelInboundEvents,
  channelInstallations,
  customerChannelIdentities,
  customers,
  conversations,
  messages,
  conversationParticipants,
} from "@/db/schema";
import type { NormalizedInboundMessage } from "@/lib/channels/types";
import { getChannelAdapter } from "@/lib/channels/registry";
import { recordAuditEvent } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/db-errors";
import {
  NotFoundError,
  AuthorizationError,
} from "@/lib/errors";
import type { ConversationChannel } from "@/db/schema";

function hashPayload(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Process a verified inbound event for an installation.
 * Idempotent on (organizationId, provider, externalEventId).
 */
export async function processInboundEvent(input: {
  installationId: string;
  headers: Record<string, string | null>;
  body: string;
}) {
  const db = getDatabase();
  const [installation] = await db
    .select()
    .from(channelInstallations)
    .where(eq(channelInstallations.id, input.installationId))
    .limit(1);
  if (!installation || installation.status !== "ACTIVE") {
    throw new NotFoundError("Installation not found.");
  }

  const adapter = getChannelAdapter({
    channel: installation.channel,
    provider: installation.provider,
  });

  const verification = await adapter.verifyWebhook(input.headers, input.body);
  if (!verification.ok) {
    throw new AuthorizationError("Webhook verification failed.");
  }

  const normalized = await adapter.parseInbound(input.headers, input.body);
  if (!normalized.length) {
    return { processed: 0, results: [] as const };
  }

  const results = [];
  for (const item of normalized) {
    results.push(
      await processNormalizedMessage({
        installation,
        item,
        payloadHash: hashPayload(input.body),
      }),
    );
  }
  return { processed: results.length, results };
}

async function processNormalizedMessage(input: {
  installation: typeof channelInstallations.$inferSelect;
  item: NormalizedInboundMessage;
  payloadHash: string;
}) {
  const { installation, item, payloadHash } = input;
  const db = getDatabase();

  // Claim event idempotency row
  try {
    await db.insert(channelInboundEvents).values({
      organizationId: installation.organizationId,
      installationId: installation.id,
      provider: item.provider,
      externalEventId: item.externalEventId,
      payloadHash,
      status: "PROCESSING",
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const [existing] = await db
        .select()
        .from(channelInboundEvents)
        .where(
          and(
            eq(channelInboundEvents.organizationId, installation.organizationId),
            eq(channelInboundEvents.provider, item.provider),
            eq(channelInboundEvents.externalEventId, item.externalEventId),
          ),
        )
        .limit(1);
      return {
        duplicate: true as const,
        eventId: existing?.id,
        messageId: existing?.messageId ?? null,
        conversationId: existing?.conversationId ?? null,
      };
    }
    throw error;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Resolve or create identity → customer
      const [identity] = await tx
        .select()
        .from(customerChannelIdentities)
        .where(
          and(
            eq(
              customerChannelIdentities.organizationId,
              installation.organizationId,
            ),
            eq(customerChannelIdentities.provider, item.provider),
            eq(
              customerChannelIdentities.externalUserId,
              item.externalIdentity.id,
            ),
          ),
        )
        .limit(1);

      let customerId = identity?.customerId;
      if (!customerId) {
        const displayName =
          item.externalIdentity.username ||
          item.externalIdentity.address ||
          `Channel user ${item.externalIdentity.id.slice(0, 8)}`;
        const [customer] = await tx
          .insert(customers)
          .values({
            organizationId: installation.organizationId,
            displayName,
            email: item.externalIdentity.address?.includes("@")
              ? item.externalIdentity.address.trim().toLowerCase()
              : null,
          })
          .returning();
        if (!customer) throw new Error("Failed to create customer");
        customerId = customer.id;

        await tx.insert(customerChannelIdentities).values({
          organizationId: installation.organizationId,
          customerId,
          channel: item.channel,
          provider: item.provider,
          externalUserId: item.externalIdentity.id,
          externalUsername: item.externalIdentity.username ?? null,
          externalAddress: item.externalIdentity.address ?? null,
        });
      }

      // Reuse open conversation for org+customer+channel, else create
      const open = await tx
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.organizationId, installation.organizationId),
            eq(conversations.customerId, customerId),
            eq(conversations.channel, item.channel as ConversationChannel),
            ne(conversations.status, "CLOSED"),
          ),
        )
        .orderBy(sql`${conversations.createdAt} desc`)
        .limit(1);

      let conversationId = open[0]?.id;
      if (!conversationId) {
        const [conversation] = await tx
          .insert(conversations)
          .values({
            organizationId: installation.organizationId,
            customerId,
            channel: item.channel as ConversationChannel,
            status: "OPEN",
            subject: `${item.channel} conversation`,
          })
          .returning();
        if (!conversation) throw new Error("Failed to create conversation");
        conversationId = conversation.id;
        await tx.insert(conversationParticipants).values({
          conversationId,
          role: "CUSTOMER",
          customerId,
        });
      }

      const body = (item.text ?? "").trim() || "[empty message]";
      const [message] = await tx
        .insert(messages)
        .values({
          conversationId,
          senderType: "CUSTOMER",
          senderCustomerId: customerId,
          body: body.slice(0, 8000),
          messageType: "TEXT",
          metadata: {
            providerMessageId: item.providerMessageId,
            provider: item.provider,
            channel: item.channel,
          },
        })
        .returning();
      if (!message) throw new Error("Failed to create message");

      await tx
        .update(conversations)
        .set({ lastMessageAt: message.createdAt, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));

      await tx
        .update(channelInboundEvents)
        .set({
          status: "PROCESSED",
          processedAt: new Date(),
          conversationId,
          messageId: message.id,
        })
        .where(
          and(
            eq(channelInboundEvents.organizationId, installation.organizationId),
            eq(channelInboundEvents.provider, item.provider),
            eq(channelInboundEvents.externalEventId, item.externalEventId),
          ),
        );

      await recordAuditEvent(
        {
          eventType: "CHANNEL_MESSAGE_RECEIVED",
          organizationId: installation.organizationId,
          payload: {
            installationId: installation.id,
            conversationId,
            messageId: message.id,
            channel: item.channel,
            provider: item.provider,
          },
        },
        tx,
      );

      return {
        duplicate: false as const,
        conversationId,
        messageId: message.id,
        customerId,
      };
    });
    return result;
  } catch (error) {
    await db
      .update(channelInboundEvents)
      .set({
        status: "FAILED",
        errorMessage:
          error instanceof Error ? error.message.slice(0, 500) : "error",
      })
      .where(
        and(
          eq(channelInboundEvents.organizationId, installation.organizationId),
          eq(channelInboundEvents.provider, item.provider),
          eq(channelInboundEvents.externalEventId, item.externalEventId),
        ),
      );
    throw error;
  }
}
