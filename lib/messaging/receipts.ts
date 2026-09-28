import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import { messages, conversations } from "@/db/schema";
import { requireVisitorSession } from "@/lib/web-chat/visitor";
import { requireOrgConversation } from "@/lib/conversations/access";
import { AuthorizationError, ValidationError } from "@/lib/errors";

/**
 * Mark messages as delivered when the recipient client has received them.
 * Idempotent: only fills null delivered_at.
 */
export async function markMessagesDelivered(
  conversationId: string,
  messageIds: string[],
  recipient: "CUSTOMER" | "MEMBERSHIP",
) {
  if (messageIds.length === 0) return { updated: 0 };
  const db = getDatabase();
  // Customer receives MEMBERSHIP messages; agent receives CUSTOMER messages
  const senderType = recipient === "CUSTOMER" ? "MEMBERSHIP" : "CUSTOMER";
  const result = await db
    .update(messages)
    .set({ deliveredAt: new Date() })
    .where(
      and(
        eq(messages.conversationId, conversationId),
        inArray(messages.id, messageIds),
        eq(messages.senderType, senderType),
        isNull(messages.deliveredAt),
      ),
    )
    .returning({ id: messages.id });
  return { updated: result.length };
}

/**
 * Batch-mark messages as seen by the customer (visitor session).
 */
export async function markConversationSeenByVisitor(
  sessionToken: string,
  upToMessageId?: string | null,
) {
  const { visitor } = await requireVisitorSession(sessionToken);
  if (!visitor.conversationId) {
    return { updated: 0 };
  }
  if (visitor.conversationId && visitor.organizationId) {
    // tenant binding via visitor.conversationId
  }

  const db = getDatabase();
  const [conv] = await db
    .select({
      id: conversations.id,
      organizationId: conversations.organizationId,
    })
    .from(conversations)
    .where(eq(conversations.id, visitor.conversationId))
    .limit(1);
  if (!conv || conv.organizationId !== visitor.organizationId) {
    throw new AuthorizationError("Conversation not available.");
  }

  const now = new Date();
  const conditions = [
    eq(messages.conversationId, conv.id),
    eq(messages.senderType, "MEMBERSHIP" as const),
    isNull(messages.seenAt),
  ];

  if (upToMessageId) {
    const [anchor] = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(
        and(
          eq(messages.id, upToMessageId),
          eq(messages.conversationId, conv.id),
        ),
      )
      .limit(1);
    if (!anchor) {
      throw new ValidationError("Invalid message boundary.");
    }
    conditions.push(sql`${messages.createdAt} <= ${anchor.createdAt}`);
  }

  const updated = await db
    .update(messages)
    .set({
      seenAt: now,
      deliveredAt: sql`coalesce(${messages.deliveredAt}, now())`,
    })
    .where(and(...conditions))
    .returning({ id: messages.id });

  return { updated: updated.length };
}

/**
 * Batch-mark customer messages as seen by an authorized agent.
 */
export async function markConversationSeenByAgent(
  actorUserId: string,
  conversationId: string,
  upToMessageId?: string | null,
) {
  await requireOrgConversation(actorUserId, conversationId);
  const db = getDatabase();
  const now = new Date();
  const conditions = [
    eq(messages.conversationId, conversationId),
    eq(messages.senderType, "CUSTOMER" as const),
    isNull(messages.seenAt),
  ];
  if (upToMessageId) {
    const [anchor] = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(
        and(
          eq(messages.id, upToMessageId),
          eq(messages.conversationId, conversationId),
        ),
      )
      .limit(1);
    if (!anchor) {
      throw new ValidationError("Invalid message boundary.");
    }
    conditions.push(sql`${messages.createdAt} <= ${anchor.createdAt}`);
  }
  const updated = await db
    .update(messages)
    .set({
      seenAt: now,
      deliveredAt: sql`coalesce(${messages.deliveredAt}, now())`,
    })
    .where(and(...conditions))
    .returning({ id: messages.id });
  return { updated: updated.length };
}
