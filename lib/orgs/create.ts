import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { memberships, organizations } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import { ConflictError } from "@/lib/errors";
import type { CreateOrganizationInput } from "@/lib/validation/auth";

export async function createOrganizationWithOwner(userId: string, input: CreateOrganizationInput) {
  const db = getDatabase();
  const existing = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, input.slug)).limit(1);
  if (existing[0]) throw new ConflictError("This organization slug is already taken.");
  const result = await db.transaction(async (tx) => {
    const [org] = await tx.insert(organizations).values({ name: input.name, slug: input.slug, status: "ACTIVE" }).returning({ id: organizations.id });
    if (!org) throw new Error("Failed to create organization");
    const [membership] = await tx.insert(memberships).values({ organizationId: org.id, userId, role: "OWNER", status: "ACTIVE" }).returning({ id: memberships.id });
    if (!membership) throw new Error("Failed to create owner membership");
    return { organizationId: org.id, membershipId: membership.id };
  });
  await recordAuditEvent({ eventType: "ORGANIZATION_CREATED", actorUserId: userId, organizationId: result.organizationId, payload: { slug: input.slug, name: input.name } });
  return result;
}
