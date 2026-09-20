import type { MembershipRole } from "@/db/schema";

const ROLE_RANK: Record<MembershipRole, number> = {
  AGENT: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function roleAtLeast(
  actual: MembershipRole,
  required: MembershipRole,
): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export function isAdminRole(role: MembershipRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/**
 * Who may hold an agent_profiles row for a membership.
 *
 * CONVORA treats OWNER, ADMIN, and AGENT as organization representatives
 * who may maintain a public professional identity for that membership.
 * There is no separate isAgent flag — membership.role remains authoritative.
 *
 * INVITED / SUSPENDED / REMOVED memberships are excluded by active-membership
 * checks, not by this helper.
 */
export function canHoldAgentProfile(role: MembershipRole): boolean {
  return role === "AGENT" || role === "ADMIN" || role === "OWNER";
}
