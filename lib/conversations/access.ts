import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { conversations, memberships } from "@/db/schema";
import { NotFoundError, AuthorizationError } from "@/lib/errors";
import { getActiveMembership } from "@/lib/authz/membership";
import type { ActiveMembership } from "@/lib/authz/membership";

/**
 * Load a conversation only if it belongs to the actor's organization.
 * Cross-tenant access returns NotFound (non-disclosure).
 */
export async function requireOrgConversation(
  actorUserId: string,
  conversationId: string,
): Promise<{
  conversation: typeof conversations.$inferSelect;
  membership: ActiveMembership;
}> {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  const conversation = rows[0];
  if (!conversation) {
    throw new NotFoundError("Conversation not found.");
  }

  const membership = await getActiveMembership(
    actorUserId,
    conversation.organizationId,
  );
  if (!membership) {
    throw new NotFoundError("Conversation not found.");
  }

  return { conversation, membership };
}

export async function requireMembershipInOrg(
  membershipId: string,
  organizationId: string,
) {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.id, membershipId),
        eq(memberships.organizationId, organizationId),
        eq(memberships.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!rows[0]) {
    throw new AuthorizationError(
      "Assignee must be an active member of this organization.",
    );
  }
  return rows[0];
}
