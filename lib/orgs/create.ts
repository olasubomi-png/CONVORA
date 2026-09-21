import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { memberships, organizations } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import { ConflictError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db-errors";
import type { CreateOrganizationInput } from "@/lib/validation/auth";
import { ensureBillingCatalog, getPlanByCode } from "@/lib/billing/plans";
import {
  organizationSubscriptions,
  subscriptionEvents,
} from "@/db/schema";

const TRIAL_DAYS = 14;

/**
 * Create an organization, OWNER membership, and 14-day Premium trial
 * in one transaction. Unique slug + unique org subscription guard duplicates.
 */
export async function createOrganizationWithOwner(
  userId: string,
  input: CreateOrganizationInput,
) {
  const db = getDatabase();

  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, input.slug))
    .limit(1);
  if (existing[0]) {
    throw new ConflictError("This organization slug is already taken.");
  }

  await ensureBillingCatalog();
  const premium = await getPlanByCode("PREMIUM");
  if (!premium) {
    throw new Error("PREMIUM plan is not configured");
  }

  let result: { organizationId: string; membershipId: string };
  try {
    result = await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({
          name: input.name,
          slug: input.slug,
          status: "ACTIVE",
        })
        .returning({ id: organizations.id });
      if (!org) {
        throw new Error("Failed to create organization");
      }

      const [membership] = await tx
        .insert(memberships)
        .values({
          organizationId: org.id,
          userId,
          role: "OWNER",
          status: "ACTIVE",
        })
        .returning({ id: memberships.id });
      if (!membership) {
        throw new Error("Failed to create owner membership");
      }

      const now = new Date();
      const trialEnds = new Date(
        now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
      );

      const [sub] = await tx
        .insert(organizationSubscriptions)
        .values({
          organizationId: org.id,
          planId: premium.id,
          status: "TRIALING",
          trialStartsAt: now,
          trialEndsAt: trialEnds,
          currentPeriodStartsAt: now,
          currentPeriodEndsAt: trialEnds,
        })
        .returning({ id: organizationSubscriptions.id });
      if (!sub) {
        throw new Error("Failed to create trial subscription");
      }

      await tx.insert(subscriptionEvents).values({
        organizationId: org.id,
        subscriptionId: sub.id,
        eventType: "TRIAL_STARTED",
        toStatus: "TRIALING",
        actorUserId: userId,
        payload: { trialDays: TRIAL_DAYS, planCode: "PREMIUM" },
      });

      return { organizationId: org.id, membershipId: membership.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("This organization slug is already taken.");
    }
    throw error;
  }

  await recordAuditEvent({
    eventType: "ORGANIZATION_CREATED",
    actorUserId: userId,
    organizationId: result.organizationId,
    payload: { slug: input.slug, name: input.name },
  });

  return result;
}
