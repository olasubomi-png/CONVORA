import { and, eq, isNull, sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  conversationAssignments,
  conversations,
  conversationAssignmentHistory,
} from "@/db/schema";
import {
  requireOrgConversation,
  requireMembershipInOrg,
} from "@/lib/conversations/access";
import { recordAuditEvent } from "@/lib/audit";
import { isAdminRole } from "@/lib/authz/roles";
import { AuthorizationError, ConflictError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db-errors";
import {
  enqueueAutomationEvent,
  flushAutomationEvents,
} from "@/lib/automation/dispatch";

/**
 * Assign conversation under row lock so concurrent assigns serialize.
 * History action is derived from locked DB state, not the pre-tx snapshot.
 */
export async function assignConversation(
  actorUserId: string,
  conversationId: string,
  assigneeMembershipId: string,
) {
  const { conversation, membership } = await requireOrgConversation(
    actorUserId,
    conversationId,
  );

  if (membership.id !== assigneeMembershipId && !isAdminRole(membership.role)) {
    throw new AuthorizationError(
      "Agents may only assign conversations to themselves.",
    );
  }

  await requireMembershipInOrg(
    assigneeMembershipId,
    conversation.organizationId,
  );

  const db = getDatabase();

  try {
    const assignmentResult = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM conversations WHERE id = ${conversationId} FOR UPDATE`,
      );

      // Authoritative previous assignee under lock
      const locked = await tx
        .select({
          assignedToMembershipId: conversations.assignedToMembershipId,
          organizationId: conversations.organizationId,
        })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);
      const current = locked[0];
      if (!current) {
        throw new AuthorizationError("Conversation not found.");
      }

      const previousMembershipId = current.assignedToMembershipId ?? null;

      // Same assignee: no-op (no misleading history)
      if (previousMembershipId === assigneeMembershipId) {
        const [existing] = await tx
          .select()
          .from(conversationAssignments)
          .where(
            and(
              eq(conversationAssignments.conversationId, conversationId),
              isNull(conversationAssignments.unassignedAt),
            ),
          )
          .limit(1);
        return existing;
      }

      const action =
        previousMembershipId === null ? "ASSIGN" : "REASSIGN";

      await tx
        .update(conversationAssignments)
        .set({ unassignedAt: new Date() })
        .where(
          and(
            eq(conversationAssignments.conversationId, conversationId),
            isNull(conversationAssignments.unassignedAt),
          ),
        );

      const [assignment] = await tx
        .insert(conversationAssignments)
        .values({
          conversationId,
          membershipId: assigneeMembershipId,
          assignedByMembershipId: membership.id,
        })
        .returning();

      if (!assignment) {
        throw new Error("Failed to create assignment");
      }

      await tx
        .update(conversations)
        .set({
          assignedToMembershipId: assigneeMembershipId,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversationId));

      await tx.insert(conversationAssignmentHistory).values({
        organizationId: current.organizationId,
        conversationId,
        actorMembershipId: membership.id,
        previousMembershipId,
        newMembershipId: assigneeMembershipId,
        action,
      });

      await recordAuditEvent(
        {
          eventType:
            action === "REASSIGN"
              ? "CONVERSATION_ASSIGNED"
              : "CONVERSATION_ASSIGNED",
          actorUserId,
          organizationId: current.organizationId,
          payload: {
            conversationId,
            membershipId: assigneeMembershipId,
            previousMembershipId,
            action,
          },
        },
        tx,
      );

      await enqueueAutomationEvent(
        {
          organizationId: conversation.organizationId,
          triggerType: "conversation.assigned",
          eventKey: `conversation:${conversationId}:assigned:${assigneeMembershipId}:${assignment.id}`,
          payload: {
            conversationId,
            conversation: {
              assignedToMembershipId: assigneeMembershipId,
            },
          },
        },
        tx,
      );
      return assignment;
    });

    await flushAutomationEvents(conversation.organizationId);
    return assignmentResult;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        "Another assignment is already active for this conversation.",
      );
    }
    throw error;
  }
}

export async function unassignConversation(
  actorUserId: string,
  conversationId: string,
) {
  const { conversation, membership } = await requireOrgConversation(
    actorUserId,
    conversationId,
  );

  if (
    conversation.assignedToMembershipId !== membership.id &&
    !isAdminRole(membership.role)
  ) {
    throw new AuthorizationError(
      "Agents may only unassign conversations assigned to themselves.",
    );
  }

  const db = getDatabase();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM conversations WHERE id = ${conversationId} FOR UPDATE`,
    );

    const locked = await tx
      .select({
        assignedToMembershipId: conversations.assignedToMembershipId,
        organizationId: conversations.organizationId,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    const current = locked[0];
    if (!current) return;

    const previousMembershipId = current.assignedToMembershipId ?? null;
    if (previousMembershipId === null) {
      return; // already unassigned
    }

    await tx
      .update(conversationAssignments)
      .set({ unassignedAt: new Date() })
      .where(
        and(
          eq(conversationAssignments.conversationId, conversationId),
          isNull(conversationAssignments.unassignedAt),
        ),
      );

    await tx
      .update(conversations)
      .set({
        assignedToMembershipId: null,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));

    await tx.insert(conversationAssignmentHistory).values({
      organizationId: current.organizationId,
      conversationId,
      actorMembershipId: membership.id,
      previousMembershipId,
      newMembershipId: null,
      action: "UNASSIGN",
    });

    await recordAuditEvent(
      {
        eventType: "CONVERSATION_UNASSIGNED",
        actorUserId,
        organizationId: current.organizationId,
        payload: {
          conversationId,
          previousMembershipId,
        },
      },
      tx,
    );

    await enqueueAutomationEvent(
      {
        organizationId: current.organizationId,
        triggerType: "conversation.unassigned",
        eventKey: `conversation:${conversationId}:unassigned:${Date.now()}`,
        payload: { conversationId },
      },
      tx,
    );
  });

  await flushAutomationEvents(conversation.organizationId);
}
