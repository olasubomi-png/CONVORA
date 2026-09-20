import { and, eq, isNull, ne, count } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  conversations,
  agentPresence,
  teams,
} from "@/db/schema";
import { getActiveMembership } from "@/lib/authz/membership";
import { AuthorizationError } from "@/lib/errors";

export async function getOrgWorkload(
  actorUserId: string,
  organizationId: string,
) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }

  const db = getDatabase();

  const [unassigned] = await db
    .select({ value: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        isNull(conversations.assignedToMembershipId),
        ne(conversations.status, "CLOSED"),
      ),
    );

  const byAgent = await db
    .select({
      membershipId: conversations.assignedToMembershipId,
      active: count(),
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        ne(conversations.status, "CLOSED"),
      ),
    )
    .groupBy(conversations.assignedToMembershipId);

  const presence = await db
    .select()
    .from(agentPresence)
    .where(eq(agentPresence.organizationId, organizationId));

  const teamList = await db
    .select()
    .from(teams)
    .where(eq(teams.organizationId, organizationId));

  return {
    unassignedCount: Number(unassigned?.value ?? 0),
    byAgent: byAgent.map((r) => ({
      membershipId: r.membershipId,
      activeCount: Number(r.active),
    })),
    presence,
    teams: teamList,
  };
}
