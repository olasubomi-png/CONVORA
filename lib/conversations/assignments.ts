import { and, eq, isNull } from "drizzle-orm";
import { getDatabase } from "@/db";
import { conversationAssignments, conversations } from "@/db/schema";
import {
  requireOrgConversation,
  requireMembershipInOrg,
} from "@/lib/conversations/access";
import { recordAuditEvent } from "@/lib/audit";
import { isAdminRole } from "@/lib/authz/roles";
import { AuthorizationError } from "@/lib/errors";

export async function assignConversation(
  actorUserId: string,
  conversationId: string,
  assigneeMembershipId: string,
) {
  const { conversation, membership } = await requireOrgConversation(
    actorUserId,
    conversationId,
  );

  // AGENT may assign to self; ADMIN/OWNER may assign to anyone in org
  if (
    membership.id !== assigneeMembershipId &&
    !isAdminRole(membership.role)
  ) {
    throw new AuthorizationError(
      "Agents may only assign conversations to themselves.",
    );
  }

  await requireMembershipInOrg(
    assigneeMembershipId,
    conversation.organizationId,
  );

  const db = getDatabase();
  return db.transaction(async (tx) => {
    // Close any open assignment rows
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

    await tx
      .update(conversations)
      .set({
        assignedToMembershipId: assigneeMembershipId,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));

    await recordAuditEvent({
      eventType: "CONVERSATION_ASSIGNED",
      actorUserId,
      organizationId: conversation.organizationId,
      payload: {
        conversationId,
        membershipId: assigneeMembershipId,
      },
    });

    return assignment;
  });
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

    await recordAuditEvent({
      eventType: "CONVERSATION_UNASSIGNED",
      actorUserId,
      organizationId: conversation.organizationId,
      payload: { conversationId },
    });
  });
}
