import { requireSession, type SessionUser } from "@/lib/auth/session";
import { listActiveMemberships, requireActiveMembership, requireOrganizationRole, type ActiveMembership } from "@/lib/authz/membership";
import type { MembershipRole } from "@/db/schema";

export type AuthContext = { user: SessionUser; sessionId: string };
export type OrganizationContext = AuthContext & { membership: ActiveMembership };

export async function requireAuthenticatedUser(): Promise<AuthContext> {
  const session = await requireSession();
  return { user: session.user, sessionId: session.sessionId };
}

export async function requireOrganizationMembership(organizationId: string): Promise<OrganizationContext> {
  const auth = await requireAuthenticatedUser();
  const membership = await requireActiveMembership(auth.user.id, organizationId);
  return { ...auth, membership };
}

export async function requireOrganizationRoleContext(organizationId: string, minimumRole: MembershipRole): Promise<OrganizationContext> {
  const auth = await requireAuthenticatedUser();
  const membership = await requireOrganizationRole(auth.user.id, organizationId, minimumRole);
  return { ...auth, membership };
}

export async function getUserOrganizationContexts(userId: string): Promise<ActiveMembership[]> {
  return listActiveMemberships(userId);
}
