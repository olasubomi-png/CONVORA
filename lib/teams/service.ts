import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { teams, teamMemberships, memberships } from "@/db/schema";
import { getActiveMembership } from "@/lib/authz/membership";
import { isAdminRole } from "@/lib/authz/roles";
import { recordAuditEvent } from "@/lib/audit";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db-errors";

async function requireAdmin(actorUserId: string, organizationId: string) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership || !isAdminRole(membership.role)) {
    throw new AuthorizationError(
      "Only admins or owners can manage teams.",
    );
  }
  return membership;
}

export async function createTeam(
  actorUserId: string,
  organizationId: string,
  input: { name: string; description?: string },
) {
  await requireAdmin(actorUserId, organizationId);
  const name = input.name.trim();
  if (!name || name.length > 80) {
    throw new ValidationError("Team name is required (max 80).");
  }
  const db = getDatabase();
  try {
    return await db.transaction(async (tx) => {
      const [team] = await tx
        .insert(teams)
        .values({
          organizationId,
          name,
          description: input.description?.trim() || null,
        })
        .returning();
      if (!team) throw new Error("Failed to create team");
      await recordAuditEvent(
        {
          eventType: "TEAM_CREATED",
          actorUserId,
          organizationId,
          payload: { teamId: team.id, name },
        },
        tx,
      );
      return team;
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new ConflictError("A team with this name already exists.");
    }
    throw e;
  }
}

export async function listTeams(actorUserId: string, organizationId: string) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }
  const db = getDatabase();
  return db
    .select()
    .from(teams)
    .where(eq(teams.organizationId, organizationId));
}

export async function addTeamMember(
  actorUserId: string,
  teamId: string,
  targetMembershipId: string,
  role: "MEMBER" | "LEAD" = "MEMBER",
) {
  const db = getDatabase();
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) throw new NotFoundError("Team not found.");

  await requireAdmin(actorUserId, team.organizationId);

  const [target] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.id, targetMembershipId),
        eq(memberships.organizationId, team.organizationId),
        eq(memberships.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!target) {
    throw new ValidationError(
      "Target must be an active member of this organization.",
    );
  }

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(teamMemberships)
        .values({
          organizationId: team.organizationId,
          teamId: team.id,
          membershipId: targetMembershipId,
          role,
        })
        .returning();
      await recordAuditEvent(
        {
          eventType: "TEAM_MEMBER_ADDED",
          actorUserId,
          organizationId: team.organizationId,
          payload: { teamId, membershipId: targetMembershipId, role },
        },
        tx,
      );
      return row;
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new ConflictError("Member is already on this team.");
    }
    throw e;
  }
}

export async function removeTeamMember(
  actorUserId: string,
  teamId: string,
  targetMembershipId: string,
) {
  const db = getDatabase();
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) throw new NotFoundError("Team not found.");
  await requireAdmin(actorUserId, team.organizationId);

  return db.transaction(async (tx) => {
    await tx
      .delete(teamMemberships)
      .where(
        and(
          eq(teamMemberships.teamId, teamId),
          eq(teamMemberships.membershipId, targetMembershipId),
          eq(teamMemberships.organizationId, team.organizationId),
        ),
      );
    await recordAuditEvent(
      {
        eventType: "TEAM_MEMBER_REMOVED",
        actorUserId,
        organizationId: team.organizationId,
        payload: { teamId, membershipId: targetMembershipId },
      },
      tx,
    );
  });
}

export async function setTeamLead(
  actorUserId: string,
  teamId: string,
  targetMembershipId: string,
  isLead: boolean,
) {
  const db = getDatabase();
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) throw new NotFoundError("Team not found.");
  await requireAdmin(actorUserId, team.organizationId);

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(teamMemberships)
      .set({ role: isLead ? "LEAD" : "MEMBER" })
      .where(
        and(
          eq(teamMemberships.teamId, teamId),
          eq(teamMemberships.membershipId, targetMembershipId),
          eq(teamMemberships.organizationId, team.organizationId),
        ),
      )
      .returning();
    if (!updated) throw new NotFoundError("Team membership not found.");
    await recordAuditEvent(
      {
        eventType: "TEAM_LEAD_CHANGED",
        actorUserId,
        organizationId: team.organizationId,
        payload: {
          teamId,
          membershipId: targetMembershipId,
          role: isLead ? "LEAD" : "MEMBER",
        },
      },
      tx,
    );
    return updated;
  });
}

export async function listTeamMembers(actorUserId: string, teamId: string) {
  const db = getDatabase();
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) throw new NotFoundError("Team not found.");
  const membership = await getActiveMembership(
    actorUserId,
    team.organizationId,
  );
  if (!membership) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }
  return db
    .select()
    .from(teamMemberships)
    .where(
      and(
        eq(teamMemberships.teamId, teamId),
        eq(teamMemberships.organizationId, team.organizationId),
      ),
    );
}

export async function deleteTeam(actorUserId: string, teamId: string) {
  const db = getDatabase();
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) throw new NotFoundError("Team not found.");
  await requireAdmin(actorUserId, team.organizationId);

  return db.transaction(async (tx) => {
    await tx.delete(teams).where(eq(teams.id, teamId));
    await recordAuditEvent(
      {
        eventType: "TEAM_DELETED",
        actorUserId,
        organizationId: team.organizationId,
        payload: { teamId },
      },
      tx,
    );
  });
}
