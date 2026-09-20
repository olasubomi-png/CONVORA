import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  agentProfiles,
  memberships,
  users,
  type MembershipRole,
  type VerificationStatus,
} from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/db-errors";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from "@/lib/errors";
import { canHoldAgentProfile, isAdminRole } from "@/lib/authz/roles";
import { getActiveMembership } from "@/lib/authz/membership";
import type { AgentProfileInput } from "@/lib/profiles/types";
import { normalizeUsername } from "@/lib/profiles/username";
import {
  assertValidVerificationTransition,
  verificationAuditEventType,
} from "@/lib/profiles/verification";

function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  return value;
}

/**
 * Resolve an active membership that may hold an agent profile.
 * Requires canHoldAgentProfile(role) — OWNER, ADMIN, or AGENT.
 */
export async function resolveWritableMembership(
  userId: string,
  organizationId: string,
): Promise<{
  membershipId: string;
  role: MembershipRole;
  organizationId: string;
}> {
  const membership = await getActiveMembership(userId, organizationId);
  if (!membership) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }
  if (!canHoldAgentProfile(membership.role)) {
    throw new AuthorizationError(
      "Your membership role cannot hold an agent profile.",
    );
  }
  return {
    membershipId: membership.id,
    role: membership.role,
    organizationId: membership.organizationId,
  };
}

export async function upsertOwnAgentProfile(
  userId: string,
  organizationId: string,
  input: AgentProfileInput,
) {
  const membership = await resolveWritableMembership(userId, organizationId);
  const db = getDatabase();
  const username = normalizeUsername(input.publicUsername);

  const existing = await db
    .select()
    .from(agentProfiles)
    .where(eq(agentProfiles.membershipId, membership.membershipId))
    .limit(1);

  if (existing[0]) {
    try {
      const [updated] = await db
        .update(agentProfiles)
        .set({
          publicUsername: username,
          displayName: input.displayName,
          professionalTitle: emptyToNull(input.professionalTitle),
          bio: emptyToNull(input.bio),
          avatarUrl: emptyToNull(input.avatarUrl),
          location: emptyToNull(input.location),
          serviceArea: emptyToNull(input.serviceArea),
          yearsExperience: input.yearsExperience ?? null,
          visibility: input.visibility ?? existing[0].visibility,
          updatedAt: new Date(),
        })
        .where(eq(agentProfiles.id, existing[0].id))
        .returning();
      if (!updated) throw new Error("Failed to update agent profile");
      await recordAuditEvent({
        eventType: "AGENT_PROFILE_UPDATED",
        actorUserId: userId,
        organizationId,
        payload: { username: updated.publicUsername },
      });
      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("This username is already taken.");
      }
      throw error;
    }
  }

  try {
    const [created] = await db
      .insert(agentProfiles)
      .values({
        membershipId: membership.membershipId,
        publicUsername: username,
        displayName: input.displayName,
        professionalTitle: emptyToNull(input.professionalTitle),
        bio: emptyToNull(input.bio),
        avatarUrl: emptyToNull(input.avatarUrl),
        location: emptyToNull(input.location),
        serviceArea: emptyToNull(input.serviceArea),
        yearsExperience: input.yearsExperience ?? null,
        visibility: input.visibility ?? "PRIVATE",
      })
      .returning();
    if (!created) throw new Error("Failed to create agent profile");
    await recordAuditEvent({
      eventType: "AGENT_PROFILE_CREATED",
      actorUserId: userId,
      organizationId,
      payload: { username: created.publicUsername },
    });
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("This username is already taken.");
    }
    throw error;
  }
}

/** Admin/owner may update an agent profile within their organization by profile id. */
export async function adminUpdateAgentProfile(
  actorUserId: string,
  organizationId: string,
  profileId: string,
  input: Partial<AgentProfileInput> & { verificationStatus?: VerificationStatus },
) {
  const actor = await getActiveMembership(actorUserId, organizationId);
  if (!actor || !isAdminRole(actor.role)) {
    throw new AuthorizationError("Insufficient role to manage agent profiles.");
  }

  const db = getDatabase();
  const rows = await db
    .select({
      profile: agentProfiles,
      membershipOrgId: memberships.organizationId,
    })
    .from(agentProfiles)
    .innerJoin(memberships, eq(agentProfiles.membershipId, memberships.id))
    .where(eq(agentProfiles.id, profileId))
    .limit(1);

  const row = rows[0];
  if (!row || row.membershipOrgId !== organizationId) {
    throw new NotFoundError("Agent profile not found.");
  }

  if (input.verificationStatus !== undefined) {
    assertValidVerificationTransition(
      row.profile.verificationStatus,
      input.verificationStatus,
    );
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.displayName !== undefined) patch.displayName = input.displayName;
  if (input.publicUsername !== undefined) {
    patch.publicUsername = normalizeUsername(input.publicUsername);
  }
  if (input.professionalTitle !== undefined) {
    patch.professionalTitle = emptyToNull(input.professionalTitle);
  }
  if (input.bio !== undefined) patch.bio = emptyToNull(input.bio);
  if (input.avatarUrl !== undefined) patch.avatarUrl = emptyToNull(input.avatarUrl);
  if (input.location !== undefined) patch.location = emptyToNull(input.location);
  if (input.serviceArea !== undefined) {
    patch.serviceArea = emptyToNull(input.serviceArea);
  }
  if (input.yearsExperience !== undefined) {
    patch.yearsExperience = input.yearsExperience;
  }
  if (input.visibility !== undefined) patch.visibility = input.visibility;
  if (input.verificationStatus !== undefined) {
    patch.verificationStatus = input.verificationStatus;
  }

  try {
    const [updated] = await db
      .update(agentProfiles)
      .set(patch)
      .where(eq(agentProfiles.id, profileId))
      .returning();
    if (!updated) throw new NotFoundError("Agent profile not found.");

    if (input.verificationStatus) {
      await recordAuditEvent({
        eventType: verificationAuditEventType(
          input.verificationStatus,
          "agent",
        ),
        actorUserId: actorUserId,
        organizationId,
        payload: {
          username: updated.publicUsername,
          status: input.verificationStatus,
        },
      });
    } else {
      await recordAuditEvent({
        eventType: "AGENT_PROFILE_UPDATED",
        actorUserId: actorUserId,
        organizationId,
        payload: { username: updated.publicUsername },
      });
    }
    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("This username is already taken.");
    }
    throw error;
  }
}

export async function getAgentProfileForMembership(membershipId: string) {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(agentProfiles)
    .where(eq(agentProfiles.membershipId, membershipId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listAgentProfilesForOrganization(organizationId: string) {
  const db = getDatabase();
  return db
    .select({
      profile: agentProfiles,
      membershipId: memberships.id,
      role: memberships.role,
      membershipStatus: memberships.status,
      userStatus: users.status,
    })
    .from(agentProfiles)
    .innerJoin(memberships, eq(agentProfiles.membershipId, memberships.id))
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.status, "ACTIVE"),
        eq(users.status, "ACTIVE"),
      ),
    );
}
