import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { memberships, organizations, type MembershipRole } from "@/db/schema";
import { AuthorizationError } from "@/lib/errors";
import { roleAtLeast } from "@/lib/authz/roles";

export type ActiveMembership = {
  id: string; organizationId: string; userId: string; role: MembershipRole; status: "ACTIVE";
  organizationName: string; organizationSlug: string; organizationStatus: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
};

export async function getActiveMembership(userId: string, organizationId: string): Promise<ActiveMembership | null> {
  const db = getDatabase();
  const rows = await db
    .select({
      id: memberships.id, organizationId: memberships.organizationId, userId: memberships.userId,
      role: memberships.role, status: memberships.status,
      organizationName: organizations.name, organizationSlug: organizations.slug, organizationStatus: organizations.status,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId), eq(memberships.status, "ACTIVE"), eq(organizations.status, "ACTIVE")))
    .limit(1);
  const row = rows[0];
  if (!row || row.status !== "ACTIVE") return null;
  return { id: row.id, organizationId: row.organizationId, userId: row.userId, role: row.role, status: "ACTIVE", organizationName: row.organizationName, organizationSlug: row.organizationSlug, organizationStatus: row.organizationStatus };
}

export async function listActiveMemberships(userId: string): Promise<ActiveMembership[]> {
  const db = getDatabase();
  const rows = await db
    .select({
      id: memberships.id, organizationId: memberships.organizationId, userId: memberships.userId,
      role: memberships.role, status: memberships.status,
      organizationName: organizations.name, organizationSlug: organizations.slug, organizationStatus: organizations.status,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "ACTIVE"), eq(organizations.status, "ACTIVE")));
  return rows.filter((r) => r.status === "ACTIVE").map((r) => ({
    id: r.id, organizationId: r.organizationId, userId: r.userId, role: r.role, status: "ACTIVE" as const,
    organizationName: r.organizationName, organizationSlug: r.organizationSlug, organizationStatus: r.organizationStatus,
  }));
}

export async function requireActiveMembership(userId: string, organizationId: string): Promise<ActiveMembership> {
  const membership = await getActiveMembership(userId, organizationId);
  if (!membership) throw new AuthorizationError("You are not an active member of this organization.");
  return membership;
}

export async function requireOrganizationRole(userId: string, organizationId: string, minimumRole: MembershipRole): Promise<ActiveMembership> {
  const membership = await requireActiveMembership(userId, organizationId);
  if (!roleAtLeast(membership.role, minimumRole)) throw new AuthorizationError("Insufficient role for this action.");
  return membership;
}
