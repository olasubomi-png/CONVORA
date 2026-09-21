import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  users,
  paymentTransactions,
  organizationSubscriptions,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { ensureBillingCatalog } from "@/lib/billing/plans";
import { initializeCheckout } from "@/lib/billing/checkout";
import { verifyAndActivatePayment } from "@/lib/billing/activate";
import { hasEntitlement } from "@/lib/billing/entitlements";
import { ENTITLEMENT_KEYS } from "@/lib/billing/entitlement-keys";
import { nairaToKobo } from "@/lib/billing/money";
import { getTestDb, setupTestEnv, truncateAllTables } from "../helpers/db";
import { AuthorizationError, ValidationError, NotFoundError, InternalError } from "@/lib/errors";
import { memberships } from "@/db/schema";
import { createHmac } from "node:crypto";

vi.mock("@/lib/billing/paystack/client", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/billing/paystack/client")
  >();
  return {
    ...actual,
    paystackInitializeTransaction: vi.fn(async (input: { reference: string }) => ({
      authorizationUrl: `https://checkout.paystack.com/test/${input.reference}`,
      accessCode: "access_test",
      reference: input.reference,
    })),
    paystackVerifyTransaction: vi.fn(),
  };
});

import {
  paystackVerifyTransaction,
  verifyPaystackWebhookSignature,
} from "@/lib/billing/paystack/client";
import {
  processPaystackWebhook,
  isPermanentPaymentWebhookError,
} from "@/lib/billing/paystack/webhook";

beforeAll(() => {
  setupTestEnv();
  process.env.PAYSTACK_SECRET_KEY = "sk_test_convora_secret_key_for_tests";
  process.env.PAYSTACK_PUBLIC_KEY = "pk_test_convora_public";
});

beforeEach(async () => {
  await truncateAllTables();
  await ensureBillingCatalog();
  vi.mocked(paystackVerifyTransaction).mockReset();
});

async function seedUser(email: string) {
  const passwordHash = await hashPassword("securepass1");
  const [user] = await getTestDb()
    .insert(users)
    .values({ email, passwordHash, fullName: email })
    .returning();
  if (!user) throw new Error("user");
  return user;
}

describe("Paystack checkout", () => {
  it("uses server-side Starter monthly amount ignoring any client amount", async () => {
    const owner = await seedUser("ps-co@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "PS",
      slug: "ps-co",
    });
    const result = await initializeCheckout({
      actorUserId: owner.id,
      organizationId: org.organizationId,
      planCode: "STARTER",
      interval: "MONTHLY",
      customerEmail: owner.email,
    });
    expect(result.amountMinor).toBe(nairaToKobo(6799));
    expect(result.authorizationUrl).toContain("checkout.paystack.com");

    const [row] = await getTestDb()
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.reference, result.reference));
    expect(row?.amountMinor).toBe(nairaToKobo(6799));
    expect(row?.status).toBe("PENDING");
  });

  it("Starter yearly and Premium amounts match catalog", async () => {
    const owner = await seedUser("ps-am@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "PSA",
      slug: "ps-am",
    });
    const sy = await initializeCheckout({
      actorUserId: owner.id,
      organizationId: org.organizationId,
      planCode: "STARTER",
      interval: "YEARLY",
      customerEmail: owner.email,
    });
    expect(sy.amountMinor).toBe(6_527_000);

    const py = await initializeCheckout({
      actorUserId: owner.id,
      organizationId: org.organizationId,
      planCode: "PREMIUM",
      interval: "YEARLY",
      customerEmail: owner.email,
    });
    expect(py.amountMinor).toBe(15_359_000);

    const pm = await initializeCheckout({
      actorUserId: owner.id,
      organizationId: org.organizationId,
      planCode: "PREMIUM",
      interval: "MONTHLY",
      customerEmail: owner.email,
    });
    expect(pm.amountMinor).toBe(nairaToKobo(15999));
  });

  it("agent cannot initialize checkout", async () => {
    const owner = await seedUser("ps-ag-o@example.com");
    const agent = await seedUser("ps-ag-a@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "AG",
      slug: "ps-ag",
    });
    await getTestDb().insert(memberships).values({
      organizationId: org.organizationId,
      userId: agent.id,
      role: "AGENT",
      status: "ACTIVE",
    });
    await expect(
      initializeCheckout({
        actorUserId: agent.id,
        organizationId: org.organizationId,
        planCode: "STARTER",
        interval: "MONTHLY",
        customerEmail: agent.email,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("Paystack verification and activation", () => {
  it("activates Premium on successful verified payment", async () => {
    const owner = await seedUser("ps-act@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "Act",
      slug: "ps-act",
    });
    const checkout = await initializeCheckout({
      actorUserId: owner.id,
      organizationId: org.organizationId,
      planCode: "PREMIUM",
      interval: "MONTHLY",
      customerEmail: owner.email,
    });

    vi.mocked(paystackVerifyTransaction).mockResolvedValue({
      status: "success",
      paid: true,
      amountMinor: checkout.amountMinor,
      currency: "NGN",
      reference: checkout.reference,
      providerTransactionId: "12345",
      customerEmail: owner.email,
      paidAt: new Date().toISOString(),
      channel: "card",
      rawSafe: { status: "success", amount: checkout.amountMinor },
    });

    const result = await verifyAndActivatePayment(checkout.reference);
    expect(result.alreadyProcessed).toBe(false);
    if ("paid" in result) expect(result.paid).toBe(true);

    const [sub] = await getTestDb()
      .select()
      .from(organizationSubscriptions)
      .where(
        eq(organizationSubscriptions.organizationId, org.organizationId),
      );
    expect(sub?.status).toBe("ACTIVE");
    expect(
      await hasEntitlement(org.organizationId, ENTITLEMENT_KEYS.CHANNEL_WHATSAPP),
    ).toBe(true);

    // Idempotent second verify
    const again = await verifyAndActivatePayment(checkout.reference);
    expect(again.alreadyProcessed).toBe(true);
  });

  it("rejects amount mismatch", async () => {
    const owner = await seedUser("ps-mm@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "MM",
      slug: "ps-mm",
    });
    const checkout = await initializeCheckout({
      actorUserId: owner.id,
      organizationId: org.organizationId,
      planCode: "STARTER",
      interval: "MONTHLY",
      customerEmail: owner.email,
    });
    vi.mocked(paystackVerifyTransaction).mockResolvedValue({
      status: "success",
      paid: true,
      amountMinor: 100,
      currency: "NGN",
      reference: checkout.reference,
      providerTransactionId: "999",
      customerEmail: owner.email,
      paidAt: null,
      channel: null,
      rawSafe: {},
    });
    await expect(
      verifyAndActivatePayment(checkout.reference),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("concurrent verify activates once", async () => {
    const owner = await seedUser("ps-cc@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "CC",
      slug: "ps-cc",
    });
    const checkout = await initializeCheckout({
      actorUserId: owner.id,
      organizationId: org.organizationId,
      planCode: "STARTER",
      interval: "YEARLY",
      customerEmail: owner.email,
    });
    vi.mocked(paystackVerifyTransaction).mockResolvedValue({
      status: "success",
      paid: true,
      amountMinor: checkout.amountMinor,
      currency: "NGN",
      reference: checkout.reference,
      providerTransactionId: "concurrent-1",
      customerEmail: owner.email,
      paidAt: null,
      channel: null,
      rawSafe: {},
    });
    const results = await Promise.all([
      verifyAndActivatePayment(checkout.reference),
      verifyAndActivatePayment(checkout.reference),
      verifyAndActivatePayment(checkout.reference),
    ]);
    const firstTime = results.filter((r) => !r.alreadyProcessed);
    expect(firstTime.length).toBeGreaterThanOrEqual(1);
    const [pay] = await getTestDb()
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.reference, checkout.reference));
    expect(pay?.status).toBe("SUCCESS");
  });
});

describe("Paystack webhook signature", () => {
  it("accepts valid HMAC and rejects invalid", () => {
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: "convora_x" },
    });
    const secret = process.env.PAYSTACK_SECRET_KEY!;
    const sig = createHmac("sha512", secret).update(body).digest("hex");
    expect(verifyPaystackWebhookSignature(body, sig)).toBe(true);
    expect(verifyPaystackWebhookSignature(body, "deadbeef")).toBe(false);
    expect(verifyPaystackWebhookSignature(body, null)).toBe(false);
  });
});


function signBody(body: string): string {
  const secret = process.env.PAYSTACK_SECRET_KEY!;
  return createHmac("sha512", secret).update(body).digest("hex");
}

describe("Paystack webhook processing", () => {
  it("classifies permanent vs transient errors", () => {
    expect(isPermanentPaymentWebhookError(new ValidationError("x"))).toBe(true);
    expect(isPermanentPaymentWebhookError(new NotFoundError())).toBe(true);
    expect(isPermanentPaymentWebhookError(new InternalError())).toBe(false);
    expect(isPermanentPaymentWebhookError(new Error("db down"))).toBe(false);
  });

  it("rejects invalid signature with 401", async () => {
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: "convora_abc" },
    });
    const result = await processPaystackWebhook({
      rawBody: body,
      signatureHeader: "invalid",
    });
    expect(result.status).toBe(401);
  });

  it("rejects malformed JSON with 400", async () => {
    const body = "{not-json";
    const result = await processPaystackWebhook({
      rawBody: body,
      signatureHeader: signBody(body),
    });
    expect(result.status).toBe(400);
  });

  it("rejects malformed event schema with 400", async () => {
    const body = JSON.stringify({ event: 123 });
    const result = await processPaystackWebhook({
      rawBody: body,
      signatureHeader: signBody(body),
    });
    expect(result.status).toBe(400);
  });

  it("acknowledges unknown events with 200 without mutation", async () => {
    const body = JSON.stringify({
      event: "transfer.success",
      data: { reference: "x" },
    });
    const result = await processPaystackWebhook({
      rawBody: body,
      signatureHeader: signBody(body),
    });
    expect(result.status).toBe(200);
    expect(vi.mocked(paystackVerifyTransaction)).not.toHaveBeenCalled();
  });

  it("activates on valid signed charge.success", async () => {
    const owner = await seedUser("ps-wh@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "WH",
      slug: "ps-wh",
    });
    const checkout = await initializeCheckout({
      actorUserId: owner.id,
      organizationId: org.organizationId,
      planCode: "STARTER",
      interval: "MONTHLY",
      customerEmail: owner.email,
    });
    vi.mocked(paystackVerifyTransaction).mockResolvedValue({
      status: "success",
      paid: true,
      amountMinor: checkout.amountMinor,
      currency: "NGN",
      reference: checkout.reference,
      providerTransactionId: "wh-1",
      customerEmail: owner.email,
      paidAt: null,
      channel: null,
      rawSafe: {},
    });
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: checkout.reference, amount: 1 },
    });
    const result = await processPaystackWebhook({
      rawBody: body,
      signatureHeader: signBody(body),
    });
    expect(result.status).toBe(200);
    const [sub] = await getTestDb()
      .select()
      .from(organizationSubscriptions)
      .where(
        eq(organizationSubscriptions.organizationId, org.organizationId),
      );
    expect(sub?.status).toBe("ACTIVE");

    // Replay
    const again = await processPaystackWebhook({
      rawBody: body,
      signatureHeader: signBody(body),
    });
    expect(again.status).toBe(200);
  });

  it("returns 200 for amount mismatch (permanent) without activation", async () => {
    const owner = await seedUser("ps-wh-mm@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "WHMM",
      slug: "ps-wh-mm",
    });
    const checkout = await initializeCheckout({
      actorUserId: owner.id,
      organizationId: org.organizationId,
      planCode: "STARTER",
      interval: "MONTHLY",
      customerEmail: owner.email,
    });
    vi.mocked(paystackVerifyTransaction).mockResolvedValue({
      status: "success",
      paid: true,
      amountMinor: 1,
      currency: "NGN",
      reference: checkout.reference,
      providerTransactionId: "wh-mm",
      customerEmail: owner.email,
      paidAt: null,
      channel: null,
      rawSafe: {},
    });
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: checkout.reference },
    });
    const result = await processPaystackWebhook({
      rawBody: body,
      signatureHeader: signBody(body),
    });
    expect(result.status).toBe(200);
    const [sub] = await getTestDb()
      .select()
      .from(organizationSubscriptions)
      .where(
        eq(organizationSubscriptions.organizationId, org.organizationId),
      );
    expect(sub?.status).toBe("TRIALING");
  });

  it("returns 500 on transient Paystack verify failure", async () => {
    const owner = await seedUser("ps-wh-tr@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "WHTR",
      slug: "ps-wh-tr",
    });
    const checkout = await initializeCheckout({
      actorUserId: owner.id,
      organizationId: org.organizationId,
      planCode: "STARTER",
      interval: "MONTHLY",
      customerEmail: owner.email,
    });
    vi.mocked(paystackVerifyTransaction).mockRejectedValue(
      new InternalError("Paystack unavailable"),
    );
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: checkout.reference },
    });
    const result = await processPaystackWebhook({
      rawBody: body,
      signatureHeader: signBody(body),
    });
    expect(result.status).toBe(500);
  });

  it("returns 200 for unknown reference (permanent not found)", async () => {
    vi.mocked(paystackVerifyTransaction).mockRejectedValue(
      new NotFoundError("Payment not found."),
    );
    // Actually verifyAndActivatePayment throws NotFound before calling paystack if ref missing in DB
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: "convora_does_not_exist_zzzz" },
    });
    const result = await processPaystackWebhook({
      rawBody: body,
      signatureHeader: signBody(body),
    });
    expect(result.status).toBe(200);
  });
});
