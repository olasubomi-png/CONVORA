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
import {
  enqueueAutomationEvent,
  flushAutomationEvents,
} from "@/lib/automation/dispatch";

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
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(conversations)
      .set({
        status,
        closedAt: status === "CLOSED" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId))
      .returning();

    await recordAuditEvent(
      {
        eventType: "CONVERSATION_STATUS_CHANGED",
        actorUserId,
        organizationId: conversation.organizationId,
        payload: {
          conversationId,
          from: conversation.status,
          to: status,
          actorMembershipId: membership.id,
        },
      },
      tx,
    );

    await enqueueAutomationEvent(
      {
        organizationId: conversation.organizationId,
        triggerType: "conversation.status_changed",
        eventKey: `conversation:${conversationId}:status:${conversation.status}:${status}:${Date.now()}`,
        payload: {
          conversationId,
          conversation: {
            status,
            previousStatus: conversation.status,
            priority: conversation.priority,
            channel: conversation.channel,
          },
        },
      },
      tx,
    );

    return row;
  });

  await flushAutomationEvents(conversation.organizationId);
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
  void membership;

  const db = getDatabase();
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(conversations)
      .set({ priority, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId))
      .returning();

    await recordAuditEvent(
      {
        eventType: "CONVERSATION_PRIORITY_CHANGED",
        actorUserId,
        organizationId: conversation.organizationId,
        payload: {
          conversationId,
          from: conversation.priority,
          to: priority,
        },
      },
      tx,
    );

    await enqueueAutomationEvent(
      {
        organizationId: conversation.organizationId,
        triggerType: "conversation.priority_changed",
        eventKey: `conversation:${conversationId}:priority:${conversation.priority}:${priority}:${Date.now()}`,
        payload: {
          conversationId,
          conversation: {
            priority,
            previousPriority: conversation.priority,
            status: conversation.status,
            channel: conversation.channel,
          },
        },
      },
      tx,
    );

    return row;
  });

  await flushAutomationEvents(conversation.organizationId);
  return updated;
}

export { isAdminRole, AuthorizationError };
