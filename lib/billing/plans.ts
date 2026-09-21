import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { billingPlans, billingPlanEntitlements } from "@/db/schema";
import { nairaToKobo, yearlyAmountFromMonthly } from "@/lib/billing/money";
import { ENTITLEMENT_KEYS } from "@/lib/billing/entitlement-keys";

/** Documented AI allowances (generations per calendar month). */
export const AI_LIMIT_STARTER = 100;
export const AI_LIMIT_PREMIUM = 2000;

const YEARLY_DISCOUNT_BPS = 2000; // exactly 20%

type EntitlementSeed = {
  key: string;
  valueBool?: boolean;
  valueInt?: number;
};

const STARTER_ENTITLEMENTS: EntitlementSeed[] = [
  { key: ENTITLEMENT_KEYS.CHANNEL_FACEBOOK, valueBool: true },
  { key: ENTITLEMENT_KEYS.CHANNEL_WEB_CHAT, valueBool: true },
  { key: ENTITLEMENT_KEYS.CHANNEL_WHATSAPP, valueBool: false },
  { key: ENTITLEMENT_KEYS.CHANNEL_INSTAGRAM, valueBool: false },
  { key: ENTITLEMENT_KEYS.AI_ENABLED, valueBool: true },
  { key: ENTITLEMENT_KEYS.AI_MONTHLY_LIMIT, valueInt: AI_LIMIT_STARTER },
  { key: ENTITLEMENT_KEYS.AUTOMATION_ENABLED, valueBool: false },
  { key: ENTITLEMENT_KEYS.ANALYTICS_ADVANCED, valueBool: false },
  { key: ENTITLEMENT_KEYS.AGENTS_MAX, valueInt: 5 },
  { key: ENTITLEMENT_KEYS.CUSTOMERS_MAX, valueInt: 500 },
  { key: ENTITLEMENT_KEYS.CONVERSATIONS_MONTHLY_LIMIT, valueInt: 1000 },
];

const PREMIUM_ENTITLEMENTS: EntitlementSeed[] = [
  { key: ENTITLEMENT_KEYS.CHANNEL_FACEBOOK, valueBool: true },
  { key: ENTITLEMENT_KEYS.CHANNEL_WEB_CHAT, valueBool: true },
  { key: ENTITLEMENT_KEYS.CHANNEL_WHATSAPP, valueBool: true },
  { key: ENTITLEMENT_KEYS.CHANNEL_INSTAGRAM, valueBool: true },
  { key: ENTITLEMENT_KEYS.AI_ENABLED, valueBool: true },
  { key: ENTITLEMENT_KEYS.AI_MONTHLY_LIMIT, valueInt: AI_LIMIT_PREMIUM },
  { key: ENTITLEMENT_KEYS.AUTOMATION_ENABLED, valueBool: true },
  { key: ENTITLEMENT_KEYS.ANALYTICS_ADVANCED, valueBool: true },
  { key: ENTITLEMENT_KEYS.AGENTS_MAX, valueInt: 50 },
  { key: ENTITLEMENT_KEYS.CUSTOMERS_MAX, valueInt: 10_000 },
  { key: ENTITLEMENT_KEYS.CONVERSATIONS_MONTHLY_LIMIT, valueInt: 20_000 },
];

/**
 * Idempotent seed of STARTER and PREMIUM plans + entitlements.
 */
export async function ensureBillingCatalog(): Promise<void> {
  const db = getDatabase();
  const starterMonthly = nairaToKobo(6799);
  const premiumMonthly = nairaToKobo(15999);
  const starterYearly = yearlyAmountFromMonthly(
    starterMonthly,
    YEARLY_DISCOUNT_BPS,
  );
  const premiumYearly = yearlyAmountFromMonthly(
    premiumMonthly,
    YEARLY_DISCOUNT_BPS,
  );

  await db.transaction(async (tx) => {
    for (const plan of [
      {
        code: "STARTER" as const,
        name: "Starter",
        monthly: starterMonthly,
        yearly: starterYearly,
        entitlements: STARTER_ENTITLEMENTS,
      },
      {
        code: "PREMIUM" as const,
        name: "Premium",
        monthly: premiumMonthly,
        yearly: premiumYearly,
        entitlements: PREMIUM_ENTITLEMENTS,
      },
    ]) {
      const existing = await tx
        .select()
        .from(billingPlans)
        .where(eq(billingPlans.code, plan.code))
        .limit(1);
      let planId = existing[0]?.id;
      if (!planId) {
        const [row] = await tx
          .insert(billingPlans)
          .values({
            code: plan.code,
            name: plan.name,
            currency: "NGN",
            monthlyAmountMinor: plan.monthly,
            yearlyDiscountBps: YEARLY_DISCOUNT_BPS,
            yearlyAmountMinor: plan.yearly,
          })
          .returning({ id: billingPlans.id });
        planId = row!.id;
      } else {
        await tx
          .update(billingPlans)
          .set({
            monthlyAmountMinor: plan.monthly,
            yearlyDiscountBps: YEARLY_DISCOUNT_BPS,
            yearlyAmountMinor: plan.yearly,
            updatedAt: new Date(),
          })
          .where(eq(billingPlans.id, planId));
      }

      for (const e of plan.entitlements) {
        const [match] = await tx
          .select()
          .from(billingPlanEntitlements)
          .where(
            and(
              eq(billingPlanEntitlements.planId, planId),
              eq(billingPlanEntitlements.key, e.key),
            ),
          )
          .limit(1);
        if (match) {
          await tx
            .update(billingPlanEntitlements)
            .set({
              valueBool: e.valueBool ?? null,
              valueInt: e.valueInt ?? null,
            })
            .where(eq(billingPlanEntitlements.id, match.id));
        } else {
          await tx.insert(billingPlanEntitlements).values({
            planId,
            key: e.key,
            valueBool: e.valueBool ?? null,
            valueInt: e.valueInt ?? null,
          });
        }
      }
    }
  });
}

export async function getPlanByCode(code: "STARTER" | "PREMIUM") {
  await ensureBillingCatalog();
  const db = getDatabase();
  const [plan] = await db
    .select()
    .from(billingPlans)
    .where(eq(billingPlans.code, code))
    .limit(1);
  return plan ?? null;
}

export async function listPlanEntitlements(planId: string) {
  const db = getDatabase();
  return db
    .select()
    .from(billingPlanEntitlements)
    .where(eq(billingPlanEntitlements.planId, planId));
}
