import { requireAuthenticatedUser } from "@/lib/authz/context";
import { getActiveMembership } from "@/lib/authz/membership";
import { getEffectiveEntitlements } from "@/lib/billing/entitlements";
import { getSubscriptionWithPlan } from "@/lib/billing/subscriptions";
import { ensureBillingCatalog, getPlanByCode } from "@/lib/billing/plans";
import { getUsageQuantity } from "@/lib/billing/usage";
import { METER_KEYS, ENTITLEMENT_KEYS } from "@/lib/billing/entitlement-keys";
import { formatNairaFromKobo } from "@/lib/billing/money";
import { listPaymentsForOrganization } from "@/lib/billing/activate";
import { jsonError, jsonOk } from "@/lib/api/response";
import { ValidationError, AuthorizationError } from "@/lib/errors";

/**
 * GET /api/billing?organizationId=
 * Returns server-side subscription + entitlements + catalog prices.
 * Never accepts client-supplied plan/status as truth.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const organizationId = new URL(request.url).searchParams.get(
      "organizationId",
    );
    if (!organizationId) {
      throw new ValidationError("organizationId is required.");
    }

    const membership = await getActiveMembership(
      auth.user.id,
      organizationId,
    );
    if (!membership) {
      throw new AuthorizationError(
        "You are not an active member of this organization.",
      );
    }

    await ensureBillingCatalog();
    const pair = await getSubscriptionWithPlan(organizationId);
    const entitlements = await getEffectiveEntitlements(organizationId);
    const starter = await getPlanByCode("STARTER");
    const premium = await getPlanByCode("PREMIUM");
    const aiUsed = await getUsageQuantity(
      organizationId,
      METER_KEYS.AI_GENERATIONS,
    );

    return jsonOk({
      subscription: pair
        ? {
            status: pair.subscription.status,
            planCode: pair.plan?.code ?? null,
            trialStartsAt: pair.subscription.trialStartsAt,
            trialEndsAt: pair.subscription.trialEndsAt,
            billingInterval: pair.subscription.billingInterval,
            currentPeriodEndsAt: pair.subscription.currentPeriodEndsAt,
          }
        : null,
      entitlements: {
        entitled: entitlements.entitled,
        planCode: entitlements.planCode,
        bool: entitlements.bool,
        int: entitlements.int,
      },
      usage: {
        aiGenerations: aiUsed,
        aiLimit: entitlements.int[ENTITLEMENT_KEYS.AI_MONTHLY_LIMIT] ?? null,
      },
      catalog: {
        starter: starter
          ? {
              code: starter.code,
              monthlyAmountMinor: starter.monthlyAmountMinor,
              yearlyAmountMinor: starter.yearlyAmountMinor,
              yearlyDiscountBps: starter.yearlyDiscountBps,
              monthlyDisplay: formatNairaFromKobo(starter.monthlyAmountMinor),
              yearlyDisplay: formatNairaFromKobo(starter.yearlyAmountMinor),
            }
          : null,
        premium: premium
          ? {
              code: premium.code,
              monthlyAmountMinor: premium.monthlyAmountMinor,
              yearlyAmountMinor: premium.yearlyAmountMinor,
              yearlyDiscountBps: premium.yearlyDiscountBps,
              monthlyDisplay: formatNairaFromKobo(premium.monthlyAmountMinor),
              yearlyDisplay: formatNairaFromKobo(premium.yearlyAmountMinor),
            }
          : null,
      },
      payments: await listPaymentsForOrganization(organizationId, 30),
      paymentIntegration: {
        ready: true,
        note: "Paystack checkout requires PAYSTACK_SECRET_KEY.",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
