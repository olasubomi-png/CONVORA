import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createCustomer } from "@/lib/customers/create";
import { createConversation } from "@/lib/conversations/create";
import { changeConversationStatus } from "@/lib/conversations/update";
import { sendAgentMessage } from "@/lib/conversations/messages";
import { parseAnalyticsFilters } from "@/lib/analytics/filters";
import { resolveAnalyticsRange } from "@/lib/analytics/range";
import { getAnalyticsOverview } from "@/lib/analytics/queries";
import { overviewToCsv } from "@/lib/analytics/export";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { getTestDb, setupTestEnv, truncateAllTables } from "../helpers/db";

beforeAll(() => {
  setupTestEnv();
});

beforeEach(async () => {
  await truncateAllTables();
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

describe("analytics range", () => {
  it("rejects invalid custom range", () => {
    expect(() =>
      resolveAnalyticsRange({
        preset: "custom",
        from: "2026-01-10",
        to: "2026-01-01",
      }),
    ).toThrow(ValidationError);
  });

  it("last_7_days is 7 UTC days", () => {
    const now = new Date("2026-09-21T12:00:00.000Z");
    const r = resolveAnalyticsRange({ preset: "last_7_days", now });
    expect(r.from.toISOString()).toBe("2026-09-15T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-09-22T00:00:00.000Z");
  });
});

describe("analytics correctness", () => {
  it("counts conversations messages customers for org", async () => {
    const owner = await seedUser("an1@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "AN1",
      slug: "an-1",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C1",
    });
    const conversation = await createConversation(
      owner.id,
      org.organizationId,
      { customerId: customer.id, initialMessage: "hi", channel: "WEB" },
    );
    await sendAgentMessage(owner.id, conversation.id, "reply");
    await changeConversationStatus(owner.id, conversation.id, "CLOSED");

    const filters = parseAnalyticsFilters({
      organizationId: org.organizationId,
      preset: "last_30_days",
    });
    const overview = await getAnalyticsOverview(owner.id, filters);

    expect(overview.summary.conversationsTotal).toBeGreaterThanOrEqual(1);
    expect(overview.summary.conversationsClosed).toBeGreaterThanOrEqual(1);
    expect(overview.summary.messagesOutbound).toBeGreaterThanOrEqual(1);
    expect(overview.summary.customersNew).toBeGreaterThanOrEqual(1);
    expect(overview.breakdowns.byChannel.some((c) => c.channel === "WEB")).toBe(
      true,
    );
    expect(overview.agents.length).toBeGreaterThanOrEqual(1);
  });

  it("channel filter narrows results", async () => {
    const owner = await seedUser("an2@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "AN2",
      slug: "an-2",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    await createConversation(owner.id, org.organizationId, {
      customerId: customer.id,
      initialMessage: "w",
      channel: "WEB",
    });
    await createConversation(owner.id, org.organizationId, {
      customerId: customer.id,
      initialMessage: "wa",
      channel: "WHATSAPP",
    });

    const web = await getAnalyticsOverview(
      owner.id,
      parseAnalyticsFilters({
        organizationId: org.organizationId,
        preset: "last_30_days",
        channel: "WEB",
      }),
    );
    expect(web.summary.conversationsTotal).toBe(1);
    expect(web.breakdowns.byChannel.every((c) => c.channel === "WEB")).toBe(
      true,
    );
  });
});

describe("analytics tenant isolation", () => {
  it("org A cannot read org B analytics", async () => {
    const a = await seedUser("ana@example.com");
    const b = await seedUser("anb@example.com");
    const orgA = await createOrganizationWithOwner(a.id, {
      name: "ANA",
      slug: "an-a",
    });
    const orgB = await createOrganizationWithOwner(b.id, {
      name: "ANB",
      slug: "an-b",
    });
    const customerB = await createCustomer(orgB.organizationId, b.id, {
      displayName: "B",
    });
    await createConversation(b.id, orgB.organizationId, {
      customerId: customerB.id,
      initialMessage: "secret",
    });

    await expect(
      getAnalyticsOverview(
        a.id,
        parseAnalyticsFilters({
          organizationId: orgB.organizationId,
          preset: "last_30_days",
        }),
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const overviewA = await getAnalyticsOverview(
      a.id,
      parseAnalyticsFilters({
        organizationId: orgA.organizationId,
        preset: "last_30_days",
      }),
    );
    expect(overviewA.summary.conversationsTotal).toBe(0);
  });
});

describe("analytics empty state", () => {
  it("returns zeros for empty org", async () => {
    const owner = await seedUser("anempty@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "Empty",
      slug: "an-empty",
    });
    const overview = await getAnalyticsOverview(
      owner.id,
      parseAnalyticsFilters({
        organizationId: org.organizationId,
        preset: "today",
      }),
    );
    expect(overview.summary.conversationsTotal).toBe(0);
    expect(overview.summary.messagesInbound).toBe(0);
    expect(overview.summary.resolutionRate).toBeNull();
  });
});

describe("analytics export", () => {
  it("produces CSV with summary and respects tenant data", async () => {
    const owner = await seedUser("ancsv@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "CSV",
      slug: "an-csv",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: 'Name "Quote"',
    });
    await createConversation(owner.id, org.organizationId, {
      customerId: customer.id,
      initialMessage: "x",
    });
    const overview = await getAnalyticsOverview(
      owner.id,
      parseAnalyticsFilters({
        organizationId: org.organizationId,
        preset: "last_30_days",
      }),
    );
    const csv = overviewToCsv(overview);
    expect(csv).toContain("conversations_total");
    expect(csv.split("\n").length).toBeGreaterThan(5);
  });
});
