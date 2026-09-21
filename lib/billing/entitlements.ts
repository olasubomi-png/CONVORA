import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  getOrganizationSubscription,
  isSubscriptionEntitled,
} from "@/lib/billing/subscriptions";
import { getPlanByCode, listPlanEntitlements } from "@/lib/billing/plans";
import type { EntitlementKey } from "@/lib/billing/entitlement-keys";
import { AuthorizationError } from "@/lib/errors";

export type EffectiveEntitlements = {
  planCode: "STARTER" | "PREMIUM" | null;
  status: string | null;
  entitled: boolean;
  trialEndsAt: Date | null;
  bool: Record<string, boolean>;
  int: Record<string, number>;
};

/**
 * Resolve effective entitlements for an organization from subscription + plan.
 * Expired / canceled / past_due without active period → no entitlements.
 */
export async function getEffectiveEntitlements(
  organizationId: string,
): Promise<EffectiveEntitlements> {
  const empty: EffectiveEntitlements = {
    planCode: null,
    status: null,
    entitled: false,
    trialEndsAt: null,
    bool: {},
    int: {},
  };

  const sub = await getOrganizationSubscription(organizationId);
  if (!sub) return empty;

  const entitled = isSubscriptionEntitled(sub.status, sub.trialEndsAt);
  if (!entitled) {
    return {
      ...empty,
      status: sub.status,
      trialEndsAt: sub.trialEndsAt,
    };
  }

  const rows = await listPlanEntitlements(sub.planId);
  const db = getDatabase();
  const { billingPlans } = await import("@/db/schema");
  const [plan] = await db
    .select()
    .from(billingPlans)
    .where(eq(billingPlans.id, sub.planId))
    .limit(1);

  const bool: Record<string, boolean> = {};
  const int: Record<string, number> = {};
  for (const r of rows) {
    if (r.valueBool !== null && r.valueBool !== undefined) {
      bool[r.key] = r.valueBool;
    }
    if (r.valueInt !== null && r.valueInt !== undefined) {
      int[r.key] = r.valueInt;
    }
  }

  return {
    planCode: (plan?.code as "STARTER" | "PREMIUM") ?? null,
    status: sub.status,
    entitled: true,
    trialEndsAt: sub.trialEndsAt,
    bool,
    int,
  };
}

export async function hasEntitlement(
  organizationId: string,
  key: EntitlementKey,
): Promise<boolean> {
  const effective = await getEffectiveEntitlements(organizationId);
  if (!effective.entitled) return false;
  return effective.bool[key] === true;
}

export async function getEntitlementLimit(
  organizationId: string,
  key: EntitlementKey,
): Promise<number | null> {
  const effective = await getEffectiveEntitlements(organizationId);
  if (!effective.entitled) return null;
  const v = effective.int[key];
  return typeof v === "number" ? v : null;
}

export async function requireEntitlement(
  organizationId: string,
  key: EntitlementKey,
): Promise<void> {
  const ok = await hasEntitlement(organizationId, key);
  if (!ok) {
    throw new AuthorizationError(
      "Your plan does not include this capability. Upgrade to continue.",
    );
  }
}

/** For tests: force STARTER plan ACTIVE without payment (admin/test only path). */
export async function activatePlanForTesting(
  organizationId: string,
  code: "STARTER" | "PREMIUM",
) {
  const plan = await getPlanByCode(code);
  if (!plan) throw new Error("plan missing");
  const db = getDatabase();
  const { organizationSubscriptions } = await import("@/db/schema");
  await db
    .update(organizationSubscriptions)
    .set({
      planId: plan.id,
      status: "ACTIVE",
      billingInterval: "MONTHLY",
      trialEndsAt: null,
      currentPeriodStartsAt: new Date(),
      currentPeriodEndsAt: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ),
      updatedAt: new Date(),
    })
    .where(eq(organizationSubscriptions.organizationId, organizationId));
}
