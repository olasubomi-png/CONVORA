import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { paymentTransactions } from "@/db/schema";
import { getActiveMembership } from "@/lib/authz/membership";
import { isAdminRole } from "@/lib/authz/roles";
import { ensureBillingCatalog, getPlanByCode } from "@/lib/billing/plans";
import { getOrganizationSubscription } from "@/lib/billing/subscriptions";
import { paystackInitializeTransaction } from "@/lib/billing/paystack/client";
import { getServerEnv } from "@/lib/env";
import {
  AuthorizationError,
  ConfigurationError,
  ValidationError,
} from "@/lib/errors";

function newReference(): string {
  return `convora_${randomBytes(16).toString("hex")}`;
}

/**
 * Server-authoritative checkout. Amount is never taken from the client.
 */
export async function initializeCheckout(input: {
  actorUserId: string;
  organizationId: string;
  planCode: "STARTER" | "PREMIUM";
  interval: "MONTHLY" | "YEARLY";
  customerEmail: string;
}) {
  const membership = await getActiveMembership(
    input.actorUserId,
    input.organizationId,
  );
  if (!membership || !isAdminRole(membership.role)) {
    throw new AuthorizationError(
      "Only organization owners or admins can manage billing.",
    );
  }

  const env = getServerEnv();
  if (!env.PAYSTACK_SECRET_KEY) {
    throw new ConfigurationError(
      "Paystack is not configured. Set PAYSTACK_SECRET_KEY to enable checkout.",
    );
  }

  await ensureBillingCatalog();
  const plan = await getPlanByCode(input.planCode);
  if (!plan) {
    throw new ValidationError("Unknown plan.");
  }

  const amountMinor =
    input.interval === "YEARLY"
      ? plan.yearlyAmountMinor
      : plan.monthlyAmountMinor;

  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new ValidationError("Invalid plan pricing configuration.");
  }

  const sub = await getOrganizationSubscription(input.organizationId);
  const reference = newReference();
  const callbackUrl = `${env.APP_URL}/app/settings/billing/return?reference=${encodeURIComponent(reference)}`;

  const db = getDatabase();
  const [txRow] = await db
    .insert(paymentTransactions)
    .values({
      organizationId: input.organizationId,
      subscriptionId: sub?.id ?? null,
      provider: "paystack",
      reference,
      planCode: input.planCode,
      billingInterval: input.interval,
      amountMinor,
      currency: "NGN",
      status: "PENDING",
      customerEmail: input.customerEmail,
    })
    .returning();

  if (!txRow) {
    throw new Error("Failed to create payment transaction");
  }

  try {
    const init = await paystackInitializeTransaction({
      email: input.customerEmail,
      amountMinor,
      currency: "NGN",
      reference,
      callbackUrl,
      metadata: {
        organization_id: input.organizationId,
        plan_code: input.planCode,
        billing_interval: input.interval,
        payment_id: txRow.id,
      },
    });

    await db
      .update(paymentTransactions)
      .set({
        authorizationUrl: init.authorizationUrl,
        updatedAt: new Date(),
        providerMeta: { accessCode: init.accessCode },
      })
      .where(eq(paymentTransactions.id, txRow.id));

    return {
      reference,
      authorizationUrl: init.authorizationUrl,
      amountMinor,
      currency: "NGN" as const,
      planCode: input.planCode,
      interval: input.interval,
      publicKey: env.PAYSTACK_PUBLIC_KEY ?? null,
    };
  } catch (error) {
    await db
      .update(paymentTransactions)
      .set({
        status: "FAILED",
        failureMessage: "Checkout initialization failed",
        updatedAt: new Date(),
      })
      .where(eq(paymentTransactions.id, txRow.id));
    throw error;
  }
}
