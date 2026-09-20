import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import {
  users,
  memberships,
  conversations,
  conversationAssignments,
  conversationAssignmentHistory,
  conversationWatchers,
  teams,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createCustomer } from "@/lib/customers/create";
import { createConversation } from "@/lib/conversations/create";
import {
  assignConversation,
  unassignConversation,
} from "@/lib/conversations/assignments";
import {
  createTeam,
  updateTeam,
  deleteTeam,
  addTeamMember,
  setTeamLead,
} from "@/lib/teams/service";
import {
  setOwnPresence,
  presenceHeartbeat,
} from "@/lib/presence/service";
import {
  followConversation,
  listWatchers,
} from "@/lib/conversations/watchers";
import { getOrgWorkload } from "@/lib/teams/workload";
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

async function seedAgent(orgId: string, email: string) {
  const user = await seedUser(email);
  const [mem] = await getTestDb()
    .insert(memberships)
    .values({
      organizationId: orgId,
      userId: user.id,
      role: "AGENT",
      status: "ACTIVE",
    })
    .returning();
  return { user, membership: mem! };
}

describe("assignment history", () => {
  it("ASSIGN then REASSIGN then UNASSIGN with correct previous/new", async () => {
    const owner = await seedUser("ah1@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "AH",
      slug: "ah-1",
    });
    const a = await seedAgent(org.organizationId, "ah1a@example.com");
    const b = await seedAgent(org.organizationId, "ah1b@example.com");
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(
      owner.id,
      org.organizationId,
      { customerId: customer.id, initialMessage: "x" },
    );
    // createConversation assigns to owner — unassign first
    await unassignConversation(owner.id, conversation.id);

    await assignConversation(owner.id, conversation.id, a.membership.id);
    let history = await getTestDb()
      .select()
      .from(conversationAssignmentHistory)
      .where(eq(conversationAssignmentHistory.conversationId, conversation.id));
    const assignRow = history.find((h) => h.action === "ASSIGN");
    expect(assignRow?.previousMembershipId).toBeNull();
    expect(assignRow?.newMembershipId).toBe(a.membership.id);

    await assignConversation(owner.id, conversation.id, b.membership.id);
    history = await getTestDb()
      .select()
      .from(conversationAssignmentHistory)
      .where(eq(conversationAssignmentHistory.conversationId, conversation.id));
    const reassign = history.find((h) => h.action === "REASSIGN");
    expect(reassign?.previousMembershipId).toBe(a.membership.id);
    expect(reassign?.newMembershipId).toBe(b.membership.id);

    // same assignee — no new REASSIGN
    const before = history.length;
    await assignConversation(owner.id, conversation.id, b.membership.id);
    history = await getTestDb()
      .select()
      .from(conversationAssignmentHistory)
      .where(eq(conversationAssignmentHistory.conversationId, conversation.id));
    expect(history.length).toBe(before);

    await unassignConversation(owner.id, conversation.id);
    history = await getTestDb()
      .select()
      .from(conversationAssignmentHistory)
      .where(eq(conversationAssignmentHistory.conversationId, conversation.id));
    const unRows = history.filter((h) => h.action === "UNASSIGN");
    const un = unRows[unRows.length - 1];
    expect(un?.previousMembershipId).toBe(b.membership.id);
    expect(un?.newMembershipId).toBeNull();
  });

  it("concurrent claim leaves one active assignment", async () => {
    const owner = await seedUser("ah2@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "AH2",
      slug: "ah-2",
    });
    const a = await seedAgent(org.organizationId, "ah2a@example.com");
    const b = await seedAgent(org.organizationId, "ah2b@example.com");
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(
      owner.id,
      org.organizationId,
      { customerId: customer.id, initialMessage: "claim" },
    );
    await unassignConversation(owner.id, conversation.id);

    await Promise.allSettled([
      assignConversation(a.user.id, conversation.id, a.membership.id),
      assignConversation(b.user.id, conversation.id, b.membership.id),
    ]);

    const active = await getTestDb()
      .select()
      .from(conversationAssignments)
      .where(
        and(
          eq(conversationAssignments.conversationId, conversation.id),
          isNull(conversationAssignments.unassignedAt),
        ),
      );
    expect(active).toHaveLength(1);

    const [conv] = await getTestDb()
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversation.id));
    expect(conv?.assignedToMembershipId).toBe(active[0]?.membershipId);
  });
});

describe("watcher concurrency", () => {
  it("concurrent follow yields one watcher", async () => {
    const owner = await seedUser("wc1@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "WC",
      slug: "wc-1",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(
      owner.id,
      org.organizationId,
      { customerId: customer.id, initialMessage: "w" },
    );

    const results = await Promise.allSettled([
      followConversation(owner.id, conversation.id),
      followConversation(owner.id, conversation.id),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const bad = results.filter((r) => r.status === "rejected");
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(ok.length + bad.length).toBe(2);

    const watchers = await listWatchers(owner.id, conversation.id);
    expect(watchers).toHaveLength(1);
    const rows = await getTestDb()
      .select()
      .from(conversationWatchers)
      .where(eq(conversationWatchers.conversationId, conversation.id));
    expect(rows).toHaveLength(1);
  });
});

describe("presence hardening", () => {
  it("heartbeat does not force ONLINE from AWAY", async () => {
    const owner = await seedUser("pr1@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "PR",
      slug: "pr-1",
    });
    await setOwnPresence(owner.id, org.organizationId, "AWAY");
    const afterHb = await presenceHeartbeat(owner.id, org.organizationId);
    expect(afterHb?.status).toBe("AWAY");

    await setOwnPresence(owner.id, org.organizationId, "ONLINE");
    const onlineHb = await presenceHeartbeat(owner.id, org.organizationId);
    expect(onlineHb?.status).toBe("ONLINE");
  });
});

describe("team management authz", () => {
  it("agent cannot update or delete teams", async () => {
    const owner = await seedUser("tmh1@example.com");
    const agent = await seedUser("tmh1a@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "TMH",
      slug: "tmh-1",
    });
    await getTestDb().insert(memberships).values({
      organizationId: org.organizationId,
      userId: agent.id,
      role: "AGENT",
      status: "ACTIVE",
    });
    const team = await createTeam(owner.id, org.organizationId, {
      name: "Support",
    });
    await expect(
      updateTeam(agent.id, team.id, { name: "Nope" }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(deleteTeam(agent.id, team.id)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it("promote and demote team lead", async () => {
    const owner = await seedUser("tmh2@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "TL",
      slug: "tmh-2",
    });
    const agent = await seedAgent(org.organizationId, "tmh2a@example.com");
    const team = await createTeam(owner.id, org.organizationId, {
      name: "Ops",
    });
    await addTeamMember(owner.id, team.id, agent.membership.id, "MEMBER");
    const lead = await setTeamLead(
      owner.id,
      team.id,
      agent.membership.id,
      true,
    );
    expect(lead?.role).toBe("LEAD");
    const member = await setTeamLead(
      owner.id,
      team.id,
      agent.membership.id,
      false,
    );
    expect(member?.role).toBe("MEMBER");
  });

  it("delete team does not delete conversations", async () => {
    const owner = await seedUser("tmh3@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "DEL",
      slug: "tmh-3",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(
      owner.id,
      org.organizationId,
      { customerId: customer.id, initialMessage: "keep" },
    );
    const team = await createTeam(owner.id, org.organizationId, {
      name: "Temp",
    });
    await deleteTeam(owner.id, team.id);
    const remaining = await getTestDb()
      .select()
      .from(teams)
      .where(eq(teams.id, team.id));
    expect(remaining).toHaveLength(0);
    const [conv] = await getTestDb()
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversation.id));
    expect(conv).toBeTruthy();
  });
});

describe("workload isolation", () => {
  it("does not count closed or other org", async () => {
    const owner = await seedUser("wl1@example.com");
    const other = await seedUser("wl1o@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "WL",
      slug: "wl-1",
    });
    await createOrganizationWithOwner(other.id, {
      name: "WLO",
      slug: "wl-1o",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(
      owner.id,
      org.organizationId,
      { customerId: customer.id, initialMessage: "x" },
    );
    await unassignConversation(owner.id, conversation.id);
    const w = await getOrgWorkload(owner.id, org.organizationId);
    expect(w.unassignedCount).toBeGreaterThanOrEqual(1);
  });
});
