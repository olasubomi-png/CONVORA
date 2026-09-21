/**
 * Payment provider abstraction.
 * Paystack (or others) plug in here without coupling the domain to a vendor.
 *
 * This phase does NOT process payments. Activating ACTIVE status requires a
 * verified provider webhook / server-side verification in a later step.
 */

export type BillingProviderName = "paystack" | "manual_test";

export type ProviderCheckoutIntent = {
  organizationId: string;
  planCode: "STARTER" | "PREMIUM";
  interval: "MONTHLY" | "YEARLY";
  amountMinor: number;
  currency: string;
  reference: string;
};

export type BillingProvider = {
  readonly name: BillingProviderName;
  /** Create a checkout/session reference — no money moves until verified. */
  createCheckoutIntent(
    input: Omit<ProviderCheckoutIntent, "reference">,
  ): Promise<ProviderCheckoutIntent>;
  /** Verify a provider transaction reference server-side. */
  verifyTransaction(
    reference: string,
  ): Promise<{ paid: boolean; amountMinor: number; currency: string }>;
};

/** Placeholder — real Paystack adapter belongs to the payment integration step. */
export class UnconfiguredBillingProvider implements BillingProvider {
  readonly name = "paystack" as const;

  async createCheckoutIntent(): Promise<ProviderCheckoutIntent> {
    throw new Error(
      "Payment provider is not configured. Billing catalog and entitlements are active; checkout belongs to the payment integration step.",
    );
  }

  async verifyTransaction(): Promise<{
    paid: boolean;
    amountMinor: number;
    currency: string;
  }> {
    throw new Error("Payment provider is not configured.");
  }
}

let provider: BillingProvider = new UnconfiguredBillingProvider();

export function getBillingProvider(): BillingProvider {
  return provider;
}

export function setBillingProvider(next: BillingProvider): void {
  provider = next;
}
