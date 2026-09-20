import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { conversationWatchers } from "@/db/schema";
import { requireOrgConversation } from "@/lib/conversations/access";
import { recordAuditEvent } from "@/lib/audit";
import { ConflictError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db-errors";

export async function followConversation(
  actorUserId: string,
  conversationId: string,
) {
  const { conversation, membership } = await requireOrgConversation(
    actorUserId,
    conversationId,
  );
  const db = getDatabase();
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(conversationWatchers)
        .values({
          organizationId: conversation.organizationId,
          conversationId,
          membershipId: membership.id,
        })
        .returning();
      await recordAuditEvent(
        {
          eventType: "CONVERSATION_WATCHER_ADDED",
          actorUserId,
          organizationId: conversation.organizationId,
          payload: { conversationId, membershipId: membership.id },
        },
        tx,
      );
      return row;
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new ConflictError("Already watching this conversation.");
    }
    throw e;
  }
}

export async function unfollowConversation(
  actorUserId: string,
  conversationId: string,
) {
  const { conversation, membership } = await requireOrgConversation(
    actorUserId,
    conversationId,
  );
  const db = getDatabase();
  return db.transaction(async (tx) => {
    await tx
      .delete(conversationWatchers)
      .where(
        and(
          eq(conversationWatchers.conversationId, conversationId),
          eq(conversationWatchers.membershipId, membership.id),
          eq(conversationWatchers.organizationId, conversation.organizationId),
        ),
      );
    await recordAuditEvent(
      {
        eventType: "CONVERSATION_WATCHER_REMOVED",
        actorUserId,
        organizationId: conversation.organizationId,
        payload: { conversationId, membershipId: membership.id },
      },
      tx,
    );
  });
}

export async function listWatchers(
  actorUserId: string,
  conversationId: string,
) {
  const { conversation } = await requireOrgConversation(
    actorUserId,
    conversationId,
  );
  const db = getDatabase();
  return db
    .select()
    .from(conversationWatchers)
    .where(
      and(
        eq(conversationWatchers.conversationId, conversationId),
        eq(conversationWatchers.organizationId, conversation.organizationId),
      ),
    );
}
