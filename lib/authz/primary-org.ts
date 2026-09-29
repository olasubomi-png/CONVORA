import { getUserOrganizationContexts } from "@/lib/authz/context";
import type { ActiveMembership } from "@/lib/authz/membership";

/**
 * Canonical "current organization" resolver for the authenticated agent app.
 *
 * CONVORA does not yet have a user-selectable org switcher; every app page
 * uses the first active membership as the workspace organization.
 * Centralize that assumption here so notification settings/bell/APIs stay
 * consistent with inbox, billing, channels, etc.
 *
 * Returns null when the user has no active organization memberships.
 */
export async function getPrimaryMembership(
  userId: string,
): Promise<ActiveMembership | null> {
  const memberships = await getUserOrganizationContexts(userId);
  return memberships[0] ?? null;
}
