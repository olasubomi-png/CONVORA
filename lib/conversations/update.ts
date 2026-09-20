import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  conversations,
  type ConversationStatus,
  type ConversationPriority,
} from "@/db/schema";
import { requireOrgConversation } from "@/lib/conversations/access";
import { assertValidStatusTransition } from "@/lib/conversations/status";
import { recordAuditEvent } from "@/lib/audit";
import { isAdminRole } from "@/lib/authz/roles";
import { AuthorizationError } from "@/lib/errors";

export async function changeConversationStatus(
  actorUserId: string,
  conversationId: string,
  status: ConversationStatus,
) {
  const { conversation, membership } = await requireOrgConversation(
    actorUserId,
    conversationId,
  );
  assertValidStatusTransition(conversation.status, status);

  const db = getDatabase();
  const [updated] = await db
    .update(conversations)
    .set({
      status,
      closedAt: status === "CLOSED" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId))
    .returning();

  await recordAuditEvent({
    eventType: "CONVERSATION_STATUS_CHANGED",
    actorUserId,
    organizationId: conversation.organizationId,
    payload: {
      conversationId,
      from: conversation.status,
      to: status,
      actorMembershipId: membership.id,
    },
  });

  return updated;
}

export async function changeConversationPriority(
  actorUserId: string,
  conversationId: string,
  priority: ConversationPriority,
) {
  const { conversation, membership } = await requireOrgConversation(
    actorUserId,
    conversationId,
  );

  // Any active org member may adjust priority in Phase 3
  void membership;

  const db = getDatabase();
  const [updated] = await db
    .update(conversations)
    .set({ priority, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId))
    .returning();

  await recordAuditEvent({
    eventType: "CONVERSATION_PRIORITY_CHANGED",
    actorUserId,
    organizationId: conversation.organizationId,
    payload: {
      conversationId,
      from: conversation.priority,
      to: priority,
    },
  });

  return updated;
}

export { isAdminRole, AuthorizationError };
