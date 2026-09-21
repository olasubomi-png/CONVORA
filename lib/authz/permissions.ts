import type { MembershipRole } from "@/db/schema";
import { getActiveMembership } from "@/lib/authz/membership";
import { AuthorizationError } from "@/lib/errors";

/**
 * Organization capability matrix.
 * UI may hide controls, but every mutation/read path must check server-side.
 */
export const PERMISSIONS = [
  "org.view",
  "org.manage",
  "members.view",
  "members.manage",
  "teams.manage",
  "conversations.view",
  "conversations.manage",
  "customers.view",
  "customers.manage",
  "analytics.view",
  "analytics.export",
  "automations.view",
  "automations.manage",
  "channels.view",
  "channels.manage",
  "ai.use",
  "profiles.manage_own",
  "profiles.manage_org",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<MembershipRole, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  ADMIN: [
    "org.view",
    "org.manage",
    "members.view",
    "members.manage",
    "teams.manage",
    "conversations.view",
    "conversations.manage",
    "customers.view",
    "customers.manage",
    "analytics.view",
    "analytics.export",
    "automations.view",
    "automations.manage",
    "channels.view",
    "channels.manage",
    "ai.use",
    "profiles.manage_own",
    "profiles.manage_org",
    "audit.view",
  ],
  AGENT: [
    "org.view",
    "members.view",
    "conversations.view",
    "conversations.manage",
    "customers.view",
    "customers.manage",
    "analytics.view",
    "automations.view",
    "channels.view",
    "ai.use",
    "profiles.manage_own",
  ],
};

export function roleHasPermission(
  role: MembershipRole,
  permission: Permission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Require active membership with the given permission.
 * Always derives authorization from server session membership — never from client claims.
 */
export async function requirePermission(
  userId: string,
  organizationId: string,
  permission: Permission,
) {
  const membership = await getActiveMembership(userId, organizationId);
  if (!membership) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }
  if (!roleHasPermission(membership.role, permission)) {
    throw new AuthorizationError("You do not have permission for this action.");
  }
  return membership;
}
