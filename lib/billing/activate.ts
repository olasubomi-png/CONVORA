import { desc, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  paymentTransactions,
  organizationSubscriptions,
  subscriptionEvents,
} from "@/db/schema";
import { getPlanByCode } from "@/lib/billing/plans";
import { paystackVerifyTransaction } from "@/lib/billing/paystack/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db-errors";

function periodEnd(from: Date, interval: "MONTHLY" | "YEARLY"): Date {
  const d = new Date(from.getTime());
  if (interval === "YEARLY") {
    d.setUTCFullYear(d.getUTCFullYear() + 1);
  } else {
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d;
}

/**
 * Verify payment with Paystack and activate subscription exactly once.
 */
export async function verifyAndActivatePayment(reference: string) {
  if (!reference || reference.length > 100) {
    throw new ValidationError("Invalid payment reference.");
  }

  const db = getDatabase();
  const [payment] = await db
    .select()
    .from(paymentTransactions)
    .where(eq(paymentTransactions.reference, reference))
    .limit(1);

  if (!payment) {
    throw new NotFoundError("Payment not found.");
  }

  // Already successfully applied
  if (payment.status === "SUCCESS" && payment.verifiedAt) {
    return {
      alreadyProcessed: true as const,
      payment,
      organizationId: payment.organizationId,
    };
  }

  const verified = await paystackVerifyTransaction(reference);

  if (!verified.paid) {
    await db
      .update(paymentTransactions)
      .set({
        status: "FAILED",
        failureMessage: `Provider status: ${verified.status}`,
        providerMeta: verified.rawSafe,
        updatedAt: new Date(),
      })
      .where(eq(paymentTransactions.id, payment.id));
    return {
      alreadyProcessed: false as const,
      paid: false as const,
      payment,
      organizationId: payment.organizationId,
    };
  }

  // Authoritative amount/currency match
  if (verified.amountMinor !== payment.amountMinor) {
    await db
      .update(paymentTransactions)
      .set({
        status: "FAILED",
        failureCode: "AMOUNT_mismatch",
        failureMessage: "Paid amount does not match expected amount.",
        providerMeta: verified.rawSafe,
        updatedAt: new Date(),
      })
      .where(eq(paymentTransactions.id, payment.id));
    throw new ValidationError("Payment amount mismatch.");
  }

  if (verified.currency !== payment.currency) {
    await db
      .update(paymentTransactions)
      .set({
        status: "FAILED",
        failureCode: "currency_mismatch",
        failureMessage: "Paid currency does not match expected currency.",
        providerMeta: verified.rawSafe,
        updatedAt: new Date(),
      })
      .where(eq(paymentTransactions.id, payment.id));
    throw new ValidationError("Payment currency mismatch.");
  }

  const plan = await getPlanByCode(payment.planCode);
  if (!plan) {
    throw new Error("Plan missing from catalog");
  }

  const now = new Date();
  const ends = periodEnd(now, payment.billingInterval);

  try {
    await db.transaction(async (tx) => {
      // Re-read payment under transaction
      const [locked] = await tx
        .select()
        .from(paymentTransactions)
        .where(eq(paymentTransactions.id, payment.id))
        .limit(1)
        .for("update");

      if (locked?.status === "SUCCESS" && locked.verifiedAt) {
        return;
      }

      await tx
        .update(paymentTransactions)
        .set({
          status: "SUCCESS",
          verifiedAt: now,
          providerTransactionId: verified.providerTransactionId,
          providerMeta: verified.rawSafe,
          updatedAt: now,
        })
        .where(eq(paymentTransactions.id, payment.id));

      const [sub] = await tx
        .select()
        .from(organizationSubscriptions)
        .where(
          eq(
            organizationSubscriptions.organizationId,
            payment.organizationId,
          ),
        )
        .limit(1)
        .for("update");

      if (!sub) {
        throw new NotFoundError("Subscription not found.");
      }

      const fromStatus = sub.status;
      await tx
        .update(organizationSubscriptions)
        .set({
          planId: plan.id,
          status: "ACTIVE",
          billingInterval: payment.billingInterval,
          currentPeriodStartsAt: now,
          currentPeriodEndsAt: ends,
          trialEndsAt: null,
          provider: "paystack",
          providerSubscriptionRef: verified.reference,
          updatedAt: now,
        })
        .where(eq(organizationSubscriptions.id, sub.id));

      await tx.insert(subscriptionEvents).values({
        organizationId: payment.organizationId,
        subscriptionId: sub.id,
        eventType: "PAYMENT_ACTIVATED",
        fromStatus,
        toStatus: "ACTIVE",
        payload: {
          reference: payment.reference,
          planCode: payment.planCode,
          interval: payment.billingInterval,
          amountMinor: payment.amountMinor,
        },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Concurrent activation with same provider tx id
      return {
        alreadyProcessed: true as const,
        payment,
        organizationId: payment.organizationId,
      };
    }
    throw error;
  }

  const [updated] = await db
    .select()
    .from(paymentTransactions)
    .where(eq(paymentTransactions.id, payment.id))
    .limit(1);

  return {
    alreadyProcessed: false as const,
    paid: true as const,
    payment: updated ?? payment,
    organizationId: payment.organizationId,
  };
}

export async function listPaymentsForOrganization(
  organizationId: string,
  limit = 50,
) {
  const db = getDatabase();
  return db
    .select({
      id: paymentTransactions.id,
      reference: paymentTransactions.reference,
      planCode: paymentTransactions.planCode,
      billingInterval: paymentTransactions.billingInterval,
      amountMinor: paymentTransactions.amountMinor,
      currency: paymentTransactions.currency,
      status: paymentTransactions.status,
      createdAt: paymentTransactions.createdAt,
      verifiedAt: paymentTransactions.verifiedAt,
    })
    .from(paymentTransactions)
    .where(eq(paymentTransactions.organizationId, organizationId))
    .orderBy(desc(paymentTransactions.createdAt))
    .limit(Math.min(limit, 100));
}
