import {
  requireAuthenticatedUser,
  getUserOrganizationContexts,
} from "@/lib/authz/context";
import { Container } from "@/components/ui/container";
import { getEffectiveEntitlements } from "@/lib/billing/entitlements";
import { getSubscriptionWithPlan } from "@/lib/billing/subscriptions";
import { ensureBillingCatalog, getPlanByCode } from "@/lib/billing/plans";
import { formatNairaFromKobo } from "@/lib/billing/money";
import { getUsageQuantity } from "@/lib/billing/usage";
import { ENTITLEMENT_KEYS, METER_KEYS } from "@/lib/billing/entitlement-keys";
import Link from "next/link";
import { CheckoutPanel } from "@/components/billing/checkout-panel";
import { listPaymentsForOrganization } from "@/lib/billing/activate";

export const metadata = { title: "Billing — CONVORA" };

export default async function BillingSettingsPage() {
  const auth = await requireAuthenticatedUser();
  const memberships = await getUserOrganizationContexts(auth.user.id);
  const primary = memberships[0];

  if (!primary) {
    return (
      <Container className="py-12">
        <h1 className="text-2xl tracking-tight">Billing</h1>
        <p className="mt-2 text-sm text-[#5c5c5c]">Create an organization first.</p>
        <Link
          href="/app/organization"
          className="mt-4 inline-block text-sm text-[#1f4e3d]"
        >
          Create organization
        </Link>
      </Container>
    );
  }

  await ensureBillingCatalog();
  const orgId = primary.organizationId;
  const pair = await getSubscriptionWithPlan(orgId);
  const entitlements = await getEffectiveEntitlements(orgId);
  const starter = await getPlanByCode("STARTER");
  const premium = await getPlanByCode("PREMIUM");
  const aiUsed = await getUsageQuantity(orgId, METER_KEYS.AI_GENERATIONS);
  const aiLimit =
    entitlements.int[ENTITLEMENT_KEYS.AI_MONTHLY_LIMIT] ?? null;
  const payments = await listPaymentsForOrganization(orgId, 20);

  const trialEnds = pair?.subscription.trialEndsAt;
  const trialRemainingMs = trialEnds
    ? Math.max(0, trialEnds.getTime() - Date.now())
    : 0;
  const trialDaysLeft = Math.ceil(trialRemainingMs / (24 * 60 * 60 * 1000));

  return (
    <Container className="py-10">
      <h1 className="text-2xl tracking-tight">Billing</h1>
      <p className="mt-1 text-sm text-[#5c5c5c]">
        Plans, trial status, and entitlements for this organization. Payment
        checkout is not enabled in this foundation phase.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="border border-[#e4e4e2] bg-white p-5">
          <h2 className="text-sm font-medium">Current subscription</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#5c5c5c]">Status</dt>
              <dd className="font-medium">
                {pair?.subscription.status ?? "NONE"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#5c5c5c]">Plan</dt>
              <dd className="font-medium">
                {entitlements.planCode ?? pair?.plan?.code ?? "—"}
              </dd>
            </div>
            {pair?.subscription.status === "TRIALING" ? (
              <>
                <div className="flex justify-between">
                  <dt className="text-[#5c5c5c]">Trial ends</dt>
                  <dd>
                    {trialEnds ? trialEnds.toISOString().slice(0, 10) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5c5c5c]">Days remaining</dt>
                  <dd>{trialDaysLeft}</dd>
                </div>
              </>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-[#5c5c5c]">Entitled</dt>
              <dd>{entitlements.entitled ? "Yes" : "No"}</dd>
            </div>
          </dl>
        </section>

        <section className="border border-[#e4e4e2] bg-white p-5">
          <h2 className="text-sm font-medium">AI usage (this month)</h2>
          <p className="mt-3 text-2xl tracking-tight">
            {aiUsed}
            <span className="text-base text-[#5c5c5c]">
              {" "}
              / {aiLimit ?? "—"}
            </span>
          </p>
          <p className="mt-2 text-xs text-[#5c5c5c]">
            Starter: 100 generations/month · Premium: 2,000 generations/month
          </p>
        </section>
      </div>

      <section className="mt-8 border border-[#e4e4e2] bg-white p-5">
        <h2 className="text-sm font-medium">Plans</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {[starter, premium].map((plan) =>
            plan ? (
              <div
                key={plan.code}
                className="border border-[#e4e4e2] p-4 text-sm"
              >
                <h3 className="font-medium">{plan.name}</h3>
                <p className="mt-2 text-lg">
                  {formatNairaFromKobo(plan.monthlyAmountMinor)}
                  <span className="text-xs text-[#5c5c5c]"> / month</span>
                </p>
                <p className="text-[#5c5c5c]">
                  Yearly ({plan.yearlyDiscountBps / 100}% off):{" "}
                  {formatNairaFromKobo(plan.yearlyAmountMinor)}
                </p>
                <ul className="mt-3 list-inside list-disc text-xs text-[#5c5c5c]">
                  {plan.code === "STARTER" ? (
                    <>
                      <li>Facebook Messenger + Web Chat</li>
                      <li>AI (100/mo)</li>
                      <li>WhatsApp / Instagram / Automations off</li>
                    </>
                  ) : (
                    <>
                      <li>All channels including WhatsApp + Instagram</li>
                      <li>AI (2,000/mo)</li>
                      <li>Automations + advanced analytics</li>
                    </>
                  )}
                </ul>
              </div>
            ) : null,
          )}
        </div>
        <p className="mt-4 text-xs text-[#5c5c5c]">
          Checkout uses Paystack. Subscription activates only after server-side
          verification of the transaction.
        </p>
      </section>

      <div className="mt-8">
        <CheckoutPanel
          organizationId={orgId}
          starter={
            starter
              ? {
                  code: starter.code,
                  monthlyDisplay: formatNairaFromKobo(starter.monthlyAmountMinor),
                  yearlyDisplay: formatNairaFromKobo(starter.yearlyAmountMinor),
                  monthlyAmountMinor: starter.monthlyAmountMinor,
                  yearlyAmountMinor: starter.yearlyAmountMinor,
                }
              : null
          }
          premium={
            premium
              ? {
                  code: premium.code,
                  monthlyDisplay: formatNairaFromKobo(premium.monthlyAmountMinor),
                  yearlyDisplay: formatNairaFromKobo(premium.yearlyAmountMinor),
                  monthlyAmountMinor: premium.monthlyAmountMinor,
                  yearlyAmountMinor: premium.yearlyAmountMinor,
                }
              : null
          }
        />
      </div>

      <section className="mt-8 border border-[#e4e4e2] bg-white p-5">
        <h2 className="text-sm font-medium">Payment history</h2>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-[#5c5c5c]">No payments yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#e4e4e2] text-sm">
            {payments.map((pay) => (
              <li
                key={pay.id}
                className="flex flex-wrap justify-between gap-2 py-2"
              >
                <span>
                  {pay.planCode} · {pay.billingInterval} · {pay.status}
                </span>
                <span>
                  {formatNairaFromKobo(pay.amountMinor)} ·{" "}
                  {pay.createdAt.toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Container>
  );
}
