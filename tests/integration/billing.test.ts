import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users, organizationSubscriptions } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { ensureBillingCatalog } from "@/lib/billing/plans";
import {
  getEffectiveEntitlements,
  hasEntitlement,
  getEntitlementLimit,
  activatePlanForTesting,
} from "@/lib/billing/entitlements";
import { getOrganizationSubscription } from "@/lib/billing/subscriptions";
import { consumeUsage } from "@/lib/billing/usage";
import { ENTITLEMENT_KEYS, METER_KEYS } from "@/lib/billing/entitlement-keys";
import { AI_LIMIT_STARTER, AI_LIMIT_PREMIUM } from "@/lib/billing/plans";
import { TRIAL_DURATION_DAYS, TRIAL_DURATION_MS } from "@/lib/billing/constants";
import { getTestDb, setupTestEnv, truncateAllTables } from "../helpers/db";

beforeAll(() => {
  setupTestEnv();
});

beforeEach(async () => {
  await truncateAllTables();
  await ensureBillingCatalog();
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

describe("organization trial", () => {
  it("creates exactly one 90-day Premium trial", async () => {
    const owner = await seedUser("bill-t@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "Trial Co",
      slug: "bill-trial",
    });
    const sub = await getOrganizationSubscription(org.organizationId);
    expect(sub).not.toBeNull();
    expect(sub!.status).toBe("TRIALING");
    expect(sub!.trialStartsAt).toBeTruthy();
    expect(sub!.trialEndsAt).toBeTruthy();
    const days =
      (sub!.trialEndsAt!.getTime() - sub!.trialStartsAt!.getTime()) /
      (24 * 60 * 60 * 1000);
    expect(days).toBeCloseTo(TRIAL_DURATION_DAYS, 0);
    expect(sub!.trialEndsAt!.getTime() - sub!.trialStartsAt!.getTime()).toBe(
      TRIAL_DURATION_MS,
    );

    const ent = await getEffectiveEntitlements(org.organizationId);
    expect(ent.entitled).toBe(true);
    expect(ent.planCode).toBe("PREMIUM");
    expect(await hasEntitlement(org.organizationId, ENTITLEMENT_KEYS.CHANNEL_WHATSAPP)).toBe(
      true,
    );
    expect(
      await hasEntitlement(org.organizationId, ENTITLEMENT_KEYS.AUTOMATION_ENABLED),
    ).toBe(true);
  });

  it("trial is active before expiration and inactive after", async () => {
    const owner = await seedUser("bill-90d@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "Ninety",
      slug: "bill-90d",
    });
    const sub = await getOrganizationSubscription(org.organizationId);
    expect(sub!.status).toBe("TRIALING");
    expect(
      await hasEntitlement(org.organizationId, ENTITLEMENT_KEYS.CHANNEL_WHATSAPP),
    ).toBe(true);

    // Simulate end of 7-day window
    await getTestDb()
      .update(organizationSubscriptions)
      .set({
        trialEndsAt: new Date(Date.now() - 1),
        updatedAt: new Date(),
      })
      .where(
        eq(organizationSubscriptions.organizationId, org.organizationId),
      );

    const after = await getOrganizationSubscription(org.organizationId);
    expect(after!.status).toBe("EXPIRED");
    expect(
      await hasEntitlement(org.organizationId, ENTITLEMENT_KEYS.CHANNEL_WHATSAPP),
    ).toBe(false);
  });


  it("prevents duplicate subscription rows", async () => {
    const owner = await seedUser("bill-dup@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "Dup",
      slug: "bill-dup",
    });
    await expect(
      getTestDb()
        .insert(organizationSubscriptions)
        .values({
          organizationId: org.organizationId,
          planId: (await getOrganizationSubscription(org.organizationId))!.planId,
          status: "TRIALING",
        }),
    ).rejects.toThrow();
  });

  it("expired trial loses Premium entitlements", async () => {
    const owner = await seedUser("bill-exp@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "Exp",
      slug: "bill-exp",
    });
    await getTestDb()
      .update(organizationSubscriptions)
      .set({
        trialEndsAt: new Date(Date.now() - 60_000),
        updatedAt: new Date(),
      })
      .where(
        eq(organizationSubscriptions.organizationId, org.organizationId),
      );

    const sub = await getOrganizationSubscription(org.organizationId);
    expect(sub!.status).toBe("EXPIRED");
    const ent = await getEffectiveEntitlements(org.organizationId);
    expect(ent.entitled).toBe(false);
    expect(
      await hasEntitlement(org.organizationId, ENTITLEMENT_KEYS.CHANNEL_WHATSAPP),
    ).toBe(false);
  });
});

describe("plan entitlements", () => {
  it("Starter enables Facebook/Web, disables WhatsApp/Instagram/Automations", async () => {
    const owner = await seedUser("bill-st@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "St",
      slug: "bill-st",
    });
    await activatePlanForTesting(org.organizationId, "STARTER");
    expect(
      await hasEntitlement(org.organizationId, ENTITLEMENT_KEYS.CHANNEL_FACEBOOK),
    ).toBe(true);
    expect(
      await hasEntitlement(org.organizationId, ENTITLEMENT_KEYS.CHANNEL_WEB_CHAT),
    ).toBe(true);
    expect(
      await hasEntitlement(org.organizationId, ENTITLEMENT_KEYS.CHANNEL_WHATSAPP),
    ).toBe(false);
    expect(
      await hasEntitlement(org.organizationId, ENTITLEMENT_KEYS.CHANNEL_INSTAGRAM),
    ).toBe(false);
    expect(
      await hasEntitlement(org.organizationId, ENTITLEMENT_KEYS.AUTOMATION_ENABLED),
    ).toBe(false);
    expect(
      await hasEntitlement(org.organizationId, ENTITLEMENT_KEYS.ANALYTICS_ADVANCED),
    ).toBe(false);
    expect(
      await getEntitlementLimit(org.organizationId, ENTITLEMENT_KEYS.AI_MONTHLY_LIMIT),
    ).toBe(AI_LIMIT_STARTER);
  });

  it("Premium enables all channels and higher AI limit", async () => {
    const owner = await seedUser("bill-pr@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "Pr",
      slug: "bill-pr",
    });
    await activatePlanForTesting(org.organizationId, "PREMIUM");
    expect(
      await hasEntitlement(org.organizationId, ENTITLEMENT_KEYS.CHANNEL_WHATSAPP),
    ).toBe(true);
    expect(
      await hasEntitlement(org.organizationId, ENTITLEMENT_KEYS.CHANNEL_INSTAGRAM),
    ).toBe(true);
    expect(
      await hasEntitlement(org.organizationId, ENTITLEMENT_KEYS.AUTOMATION_ENABLED),
    ).toBe(true);
    expect(
      await getEntitlementLimit(org.organizationId, ENTITLEMENT_KEYS.AI_MONTHLY_LIMIT),
    ).toBe(AI_LIMIT_PREMIUM);
  });
});

describe("usage metering", () => {
  it("enforces AI monthly limit and resists concurrent overshoot", async () => {
    const owner = await seedUser("bill-ai@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "AI",
      slug: "bill-ai",
    });
    await activatePlanForTesting(org.organizationId, "STARTER");

    const results = await Promise.all(
      Array.from({ length: AI_LIMIT_STARTER + 20 }, () =>
        consumeUsage({
          organizationId: org.organizationId,
          meterKey: METER_KEYS.AI_GENERATIONS,
          limitKey: ENTITLEMENT_KEYS.AI_MONTHLY_LIMIT,
        }),
      ),
    );
    const allowed = results.filter((r) => r.allowed).length;
    expect(allowed).toBe(AI_LIMIT_STARTER);
    const denied = results.filter((r) => !r.allowed).length;
    expect(denied).toBeGreaterThan(0);
  });
});

describe("tenant isolation", () => {
  it("org A entitlements do not apply to org B", async () => {
    const a = await seedUser("bill-a@example.com");
    const b = await seedUser("bill-b@example.com");
    const orgA = await createOrganizationWithOwner(a.id, {
      name: "A",
      slug: "bill-a",
    });
    const orgB = await createOrganizationWithOwner(b.id, {
      name: "B",
      slug: "bill-b",
    });
    await activatePlanForTesting(orgA.organizationId, "STARTER");
    // B still on trial Premium
    expect(
      await hasEntitlement(orgA.organizationId, ENTITLEMENT_KEYS.CHANNEL_WHATSAPP),
    ).toBe(false);
    expect(
      await hasEntitlement(orgB.organizationId, ENTITLEMENT_KEYS.CHANNEL_WHATSAPP),
    ).toBe(true);
  });
});
