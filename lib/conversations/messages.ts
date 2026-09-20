import { and, desc, eq, lt, isNull } from "drizzle-orm";
import { getDatabase } from "@/db";
import { messages, conversations } from "@/db/schema";
import { requireOrgConversation } from "@/lib/conversations/access";
import { ValidationError } from "@/lib/errors";

const PAGE_SIZE = 50;

export async function sendAgentMessage(
  actorUserId: string,
  conversationId: string,
  body: string,
) {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new ValidationError("Message body is required.");
  }

  const { conversation, membership } = await requireOrgConversation(
    actorUserId,
    conversationId,
  );

  if (conversation.status === "CLOSED") {
    throw new ValidationError("Cannot send messages to a closed conversation.");
  }

  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [message] = await tx
      .insert(messages)
      .values({
        conversationId,
        senderType: "MEMBERSHIP",
        senderMembershipId: membership.id,
        body: trimmed,
        messageType: "TEXT",
      })
      .returning();
    if (!message) throw new Error("Failed to create message");

    await tx
      .update(conversations)
      .set({ lastMessageAt: message.createdAt, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    return message;
  });
}

/**
 * Cursor pagination: before = older, after = newer.
 * Default: latest PAGE_SIZE messages ascending for display.
 */
export async function listMessages(
  actorUserId: string,
  conversationId: string,
  options?: { before?: string; after?: string; limit?: number },
) {
  await requireOrgConversation(actorUserId, conversationId);
  const limit = Math.min(options?.limit ?? PAGE_SIZE, 100);
  const db = getDatabase();

  if (options?.before) {
    const anchor = await db
      .select()
      .from(messages)
      .where(eq(messages.id, options.before))
      .limit(1);
    if (!anchor[0] || anchor[0].conversationId !== conversationId) {
      return { messages: [], nextCursor: null };
    }
    const rows = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          isNull(messages.deletedAt),
          lt(messages.createdAt, anchor[0].createdAt),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    const ordered = rows.reverse();
    return {
      messages: ordered,
      nextCursor: ordered[0]?.id ?? null,
    };
  }

  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.deletedAt),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  const ordered = rows.reverse();
  return {
    messages: ordered,
    nextCursor: ordered[0]?.id ?? null,
  };
}
