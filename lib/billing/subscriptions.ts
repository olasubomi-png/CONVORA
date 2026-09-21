import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  organizationSubscriptions,
  subscriptionEvents,
  billingPlans,
} from "@/db/schema";
import { getPlanByCode } from "@/lib/billing/plans";
import { ConflictError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db-errors";

const TRIAL_DAYS = 14;

type Tx = Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0];

/**
 * Create the initial Premium trial subscription for a new organization.
 * Must run inside the org-creation transaction when possible.
 */
export async function createTrialSubscription(
  organizationId: string,
  tx?: Tx,
) {
  const db = tx ?? getDatabase();
  const premium = await getPlanByCode("PREMIUM");
  if (!premium) {
    throw new Error("PREMIUM plan missing from catalog");
  }

  const now = new Date();
  const trialEnds = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  try {
    const [sub] = await db
      .insert(organizationSubscriptions)
      .values({
        organizationId,
        planId: premium.id,
        status: "TRIALING",
        billingInterval: null,
        trialStartsAt: now,
        trialEndsAt: trialEnds,
        currentPeriodStartsAt: now,
        currentPeriodEndsAt: trialEnds,
      })
      .returning();
    if (!sub) throw new Error("Failed to create trial subscription");

    await db.insert(subscriptionEvents).values({
      organizationId,
      subscriptionId: sub.id,
      eventType: "TRIAL_STARTED",
      fromStatus: null,
      toStatus: "TRIALING",
      payload: {
        trialDays: TRIAL_DAYS,
        planCode: "PREMIUM",
      },
    });

    return sub;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        "Organization already has a subscription (trial cannot be duplicated).",
      );
    }
    throw error;
  }
}

/**
 * Load subscription; if TRIALING and past trialEndsAt, materialize EXPIRED.
 */
export async function getOrganizationSubscription(organizationId: string) {
  const db = getDatabase();
  const [sub] = await db
    .select()
    .from(organizationSubscriptions)
    .where(eq(organizationSubscriptions.organizationId, organizationId))
    .limit(1);
  if (!sub) return null;

  if (
    sub.status === "TRIALING" &&
    sub.trialEndsAt &&
    sub.trialEndsAt.getTime() <= Date.now()
  ) {
    const [updated] = await db
      .update(organizationSubscriptions)
      .set({ status: "EXPIRED", updatedAt: new Date() })
      .where(eq(organizationSubscriptions.id, sub.id))
      .returning();
    if (updated) {
      await db.insert(subscriptionEvents).values({
        organizationId,
        subscriptionId: sub.id,
        eventType: "TRIAL_EXPIRED",
        fromStatus: "TRIALING",
        toStatus: "EXPIRED",
        payload: {},
      });
      return updated;
    }
  }
  return sub;
}

export async function getSubscriptionWithPlan(organizationId: string) {
  const sub = await getOrganizationSubscription(organizationId);
  if (!sub) return null;
  const db = getDatabase();
  const [plan] = await db
    .select()
    .from(billingPlans)
    .where(eq(billingPlans.id, sub.planId))
    .limit(1);
  return { subscription: sub, plan: plan ?? null };
}

/**
 * Whether the subscription currently grants plan entitlements.
 */
export function isSubscriptionEntitled(
  status: string,
  trialEndsAt: Date | null,
  now = new Date(),
): boolean {
  if (status === "ACTIVE") return true;
  if (status === "TRIALING") {
    if (!trialEndsAt) return false;
    return trialEndsAt.getTime() > now.getTime();
  }
  return false;
}
