import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { organizationProfiles, organizations, type VerificationStatus } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import { AuthorizationError, NotFoundError } from "@/lib/errors";
import {
  assertValidVerificationTransition,
  verificationAuditEventType,
} from "@/lib/profiles/verification";
import { getActiveMembership } from "@/lib/authz/membership";
import { isAdminRole } from "@/lib/authz/roles";
import type { OrganizationProfileInput } from "@/lib/profiles/types";

function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  return value;
}

export async function upsertOrganizationProfile(
  actorUserId: string,
  organizationId: string,
  input: OrganizationProfileInput,
) {
  const actor = await getActiveMembership(actorUserId, organizationId);
  if (!actor || !isAdminRole(actor.role)) {
    throw new AuthorizationError(
      "Only organization admins or owners can manage the organization profile.",
    );
  }

  const db = getDatabase();
  const existing = await db
    .select()
    .from(organizationProfiles)
    .where(eq(organizationProfiles.organizationId, organizationId))
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(organizationProfiles)
      .set({
        displayName: input.displayName,
        legalName: emptyToNull(input.legalName),
        logoUrl: emptyToNull(input.logoUrl),
        bannerUrl: emptyToNull(input.bannerUrl),
        description: emptyToNull(input.description),
        websiteUrl: emptyToNull(input.websiteUrl),
        publicEmail: emptyToNull(input.publicEmail),
        publicPhone: emptyToNull(input.publicPhone),
        location: emptyToNull(input.location),
        serviceArea: emptyToNull(input.serviceArea),
        visibility: input.visibility ?? existing[0].visibility,
        updatedAt: new Date(),
      })
      .where(eq(organizationProfiles.id, existing[0].id))
      .returning();
    if (!updated) throw new Error("Failed to update organization profile");
    await recordAuditEvent({
      eventType: "ORGANIZATION_PROFILE_UPDATED",
      actorUserId: actorUserId,
      organizationId,
      payload: { displayName: updated.displayName },
    });
    return updated;
  }

  const [created] = await db
    .insert(organizationProfiles)
    .values({
      organizationId,
      displayName: input.displayName,
      legalName: emptyToNull(input.legalName),
      logoUrl: emptyToNull(input.logoUrl),
      bannerUrl: emptyToNull(input.bannerUrl),
      description: emptyToNull(input.description),
      websiteUrl: emptyToNull(input.websiteUrl),
      publicEmail: emptyToNull(input.publicEmail),
      publicPhone: emptyToNull(input.publicPhone),
      location: emptyToNull(input.location),
      serviceArea: emptyToNull(input.serviceArea),
      visibility: input.visibility ?? "PRIVATE",
    })
    .returning();
  if (!created) throw new Error("Failed to create organization profile");
  await recordAuditEvent({
    eventType: "ORGANIZATION_PROFILE_CREATED",
    actorUserId: actorUserId,
    organizationId,
    payload: { displayName: created.displayName },
  });
  return created;
}

export async function setOrganizationVerification(
  actorUserId: string,
  organizationId: string,
  status: VerificationStatus,
) {
  const actor = await getActiveMembership(actorUserId, organizationId);
  if (!actor || actor.role !== "OWNER") {
    throw new AuthorizationError(
      "Only the organization owner can change organization verification state in Phase 2.",
    );
  }

  const db = getDatabase();
  const existing = await db
    .select()
    .from(organizationProfiles)
    .where(eq(organizationProfiles.organizationId, organizationId))
    .limit(1);
  if (!existing[0]) {
    throw new NotFoundError("Organization profile not found.");
  }

  assertValidVerificationTransition(existing[0].verificationStatus, status);

  const [updated] = await db
    .update(organizationProfiles)
    .set({ verificationStatus: status, updatedAt: new Date() })
    .where(eq(organizationProfiles.id, existing[0].id))
    .returning();

  await recordAuditEvent({
    eventType: verificationAuditEventType(status, "organization"),
    actorUserId: actorUserId,
    organizationId,
    payload: { status },
  });

  return updated;
}

export async function getOrganizationProfile(organizationId: string) {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(organizationProfiles)
    .where(eq(organizationProfiles.organizationId, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getOrganizationBySlug(slug: string) {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}
