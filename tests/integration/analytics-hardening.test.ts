import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { users, memberships } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createCustomer } from "@/lib/customers/create";
import { createConversation } from "@/lib/conversations/create";
import { changeConversationStatus } from "@/lib/conversations/update";
import { assignConversation } from "@/lib/conversations/assignments";
import { sendAgentMessage } from "@/lib/conversations/messages";
import { parseAnalyticsFilters } from "@/lib/analytics/filters";
import { getAnalyticsOverview, listOrganizationAgents } from "@/lib/analytics/queries";
import { overviewToCsv } from "@/lib/analytics/export";
import { AuthorizationError } from "@/lib/errors";
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

describe("filter combinations", () => {
  it("channel + status + priority + agent all apply", async () => {
    const owner = await seedUser("fh-o@example.com");
    const agent = await seedUser("fh-a@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "FH",
      slug: "fh-1",
    });
    const [agentMem] = await getTestDb()
      .insert(memberships)
      .values({
        organizationId: org.organizationId,
        userId: agent.id,
        role: "AGENT",
        status: "ACTIVE",
      })
      .returning();

    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });

    // Matching: WHATSAPP, OPEN, HIGH, agent
    const match = await createConversation(owner.id, org.organizationId, {
      customerId: customer.id,
      initialMessage: "match",
      channel: "WHATSAPP",
      priority: "HIGH",
    });
    await assignConversation(owner.id, match.id, agentMem!.id);
    await sendAgentMessage(agent.id, match.id, "agent reply");

    // Non-matching: WEB
    await createConversation(owner.id, org.organizationId, {
      customerId: customer.id,
      initialMessage: "web",
      channel: "WEB",
      priority: "HIGH",
    });

    // Non-matching: CLOSED
    const closed = await createConversation(owner.id, org.organizationId, {
      customerId: customer.id,
      initialMessage: "closed",
      channel: "WHATSAPP",
      priority: "HIGH",
    });
    await assignConversation(owner.id, closed.id, agentMem!.id);
    await changeConversationStatus(owner.id, closed.id, "CLOSED");

    // Non-matching: NORMAL priority
    await createConversation(owner.id, org.organizationId, {
      customerId: customer.id,
      initialMessage: "normal",
      channel: "WHATSAPP",
      priority: "NORMAL",
    });

    const overview = await getAnalyticsOverview(
      owner.id,
      parseAnalyticsFilters({
        organizationId: org.organizationId,
        preset: "last_30_days",
        channel: "WHATSAPP",
        status: "OPEN",
        priority: "HIGH",
        agentMembershipId: agentMem!.id,
      }),
    );

    expect(overview.summary.conversationsTotal).toBe(1);
    expect(overview.summary.messagesOutbound).toBeGreaterThanOrEqual(1);
    expect(overview.agents).toHaveLength(1);
    expect(overview.agents[0]!.membershipId).toBe(agentMem!.id);
    expect(overview.agents[0]!.conversationsAssigned).toBe(1);
    expect(overview.agents[0]!.messagesSent).toBeGreaterThanOrEqual(1);
    expect(overview.filters.channel).toBe("WHATSAPP");
  });

  it("status filter alone", async () => {
    const owner = await seedUser("fh-st@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "ST",
      slug: "fh-st",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const c1 = await createConversation(owner.id, org.organizationId, {
      customerId: customer.id,
      initialMessage: "a",
    });
    await changeConversationStatus(owner.id, c1.id, "CLOSED");
    await createConversation(owner.id, org.organizationId, {
      customerId: customer.id,
      initialMessage: "b",
    });

    const closed = await getAnalyticsOverview(
      owner.id,
      parseAnalyticsFilters({
        organizationId: org.organizationId,
        preset: "last_30_days",
        status: "CLOSED",
      }),
    );
    expect(closed.summary.conversationsTotal).toBe(1);
    expect(closed.summary.conversationsClosed).toBe(1);
  });
});

describe("export filters", () => {
  it("CSV includes active filter metadata without internal IDs", async () => {
    const owner = await seedUser("fh-csv@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "CSV",
      slug: "fh-csv",
    });
    const overview = await getAnalyticsOverview(
      owner.id,
      parseAnalyticsFilters({
        organizationId: org.organizationId,
        preset: "last_7_days",
        channel: "WEB",
      }),
    );
    const csv = overviewToCsv(overview);
    expect(csv).toContain("meta,channel,WEB");
    expect(csv).toContain("meta,preset,last_7_days");
    expect(csv).toContain("summary,conversations_total");
    expect(csv).not.toContain("agentMembershipId");
    expect(csv).toContain("meta,agent,");
  });
});

describe("agent list isolation", () => {
  it("cannot list agents for foreign org", async () => {
    const a = await seedUser("fh-aa@example.com");
    const b = await seedUser("fh-bb@example.com");
    await createOrganizationWithOwner(a.id, { name: "A", slug: "fh-aa" });
    const orgB = await createOrganizationWithOwner(b.id, {
      name: "B",
      slug: "fh-bb",
    });
    await expect(
      listOrganizationAgents(a.id, orgB.organizationId),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("export cross-tenant", () => {
  it("rejects overview for foreign org", async () => {
    const a = await seedUser("fh-xa@example.com");
    const b = await seedUser("fh-xb@example.com");
    await createOrganizationWithOwner(a.id, { name: "XA", slug: "fh-xa" });
    const orgB = await createOrganizationWithOwner(b.id, {
      name: "XB",
      slug: "fh-xb",
    });
    await expect(
      getAnalyticsOverview(
        a.id,
        parseAnalyticsFilters({
          organizationId: orgB.organizationId,
          preset: "today",
        }),
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("agent list empty vs failure", () => {
  it("returns empty list for org with only owner when filtering agents is not required", async () => {
    // Owner membership still exists — list includes active members
    const owner = await seedUser("fh-za@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "ZA",
      slug: "fh-za",
    });
    const list = await listOrganizationAgents(owner.id, org.organizationId);
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);
  });
});
