import { and, eq, isNull, sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import { conversationAssignments, conversations } from "@/db/schema";
import {
  requireOrgConversation,
  requireMembershipInOrg,
} from "@/lib/conversations/access";
import { recordAuditEvent } from "@/lib/audit";
import { isAdminRole } from "@/lib/authz/roles";
import { AuthorizationError, ConflictError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db-errors";

/**
 * Assign conversation under row lock so concurrent assigns serialize.
 * Partial unique index guarantees at most one active assignment row.
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
    return await db.transaction(async (tx) => {
      // Serialize concurrent assignment attempts on this conversation
      await tx.execute(
        sql`SELECT id FROM conversations WHERE id = ${conversationId} FOR UPDATE`,
      );

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

      await recordAuditEvent(
        {
          eventType: "CONVERSATION_ASSIGNED",
          actorUserId,
          organizationId: conversation.organizationId,
          payload: {
            conversationId,
            membershipId: assigneeMembershipId,
          },
        },
        tx,
      );

      return assignment;
    });
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

    await recordAuditEvent(
      {
        eventType: "CONVERSATION_UNASSIGNED",
        actorUserId,
        organizationId: conversation.organizationId,
        payload: { conversationId },
      },
      tx,
    );
  });
}
