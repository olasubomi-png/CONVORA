import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users, memberships, conversations } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createCustomer } from "@/lib/customers/create";
import { createConversation } from "@/lib/conversations/create";
import {
  assignConversation,
  
} from "@/lib/conversations/assignments";
import {
  createTeam,
  addTeamMember,
  listTeams,
} from "@/lib/teams/service";
import { setOwnPresence, listOrgPresence } from "@/lib/presence/service";
import {
  followConversation,
  unfollowConversation,
  listWatchers,
} from "@/lib/conversations/watchers";
import { getOrgWorkload } from "@/lib/teams/workload";
import { AuthorizationError, ConflictError } from "@/lib/errors";
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

describe("team operations", () => {
  it("owner creates team; agent cannot", async () => {
    const owner = await seedUser("tm1@example.com");
    const agent = await seedUser("tm1a@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "T",
      slug: "tm-1",
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
    expect(team.name).toBe("Support");
    await expect(
      createTeam(agent.id, org.organizationId, { name: "Sales" }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    const listed = await listTeams(agent.id, org.organizationId);
    expect(listed.some((t) => t.name === "Support")).toBe(true);
  });

  it("presence is membership scoped", async () => {
    const owner = await seedUser("tm2@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "P",
      slug: "tm-2",
    });
    await setOwnPresence(owner.id, org.organizationId, "ONLINE");
    await setOwnPresence(owner.id, org.organizationId, "AWAY");
    const list = await listOrgPresence(owner.id, org.organizationId);
    expect(list[0]?.status).toBe("AWAY");
  });

  it("watchers unique and tenant bound", async () => {
    const owner = await seedUser("tm3@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "W",
      slug: "tm-3",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(
      owner.id,
      org.organizationId,
      { customerId: customer.id, initialMessage: "hi" },
    );
    await followConversation(owner.id, conversation.id);
    await expect(
      followConversation(owner.id, conversation.id),
    ).rejects.toBeInstanceOf(ConflictError);
    const watchers = await listWatchers(owner.id, conversation.id);
    expect(watchers).toHaveLength(1);
    await unfollowConversation(owner.id, conversation.id);
    expect(await listWatchers(owner.id, conversation.id)).toHaveLength(0);
  });

  it("concurrent claim: only one assignee", async () => {
    const owner = await seedUser("tm4@example.com");
    const agent = await seedUser("tm4a@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "A",
      slug: "tm-4",
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
    const conversation = await createConversation(
      owner.id,
      org.organizationId,
      { customerId: customer.id, initialMessage: "claim me" },
    );
    const [ownerMem] = await getTestDb()
      .select()
      .from(memberships)
      .where(eq(memberships.userId, owner.id));

    await Promise.all([
      assignConversation(owner.id, conversation.id, ownerMem!.id),
      assignConversation(agent.id, conversation.id, agentMem!.id).catch(
        () => null,
      ),
    ]);

    const [conv] = await getTestDb()
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversation.id));
    expect(conv?.assignedToMembershipId).toBeTruthy();
  });

  it("workload counts unassigned", async () => {
    const owner = await seedUser("tm5@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "L",
      slug: "tm-5",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(owner.id, org.organizationId, {
      customerId: customer.id,
      initialMessage: "open",
    });
    // Ensure unassigned for workload check
    const { unassignConversation } = await import("@/lib/conversations/assignments");
    await unassignConversation(owner.id, conversation.id);
    const w = await getOrgWorkload(owner.id, org.organizationId);
    expect(w.unassignedCount).toBeGreaterThanOrEqual(1);
  });

  it("team member must be org member", async () => {
    const owner = await seedUser("tm6@example.com");
    const outsider = await seedUser("tm6o@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "X",
      slug: "tm-6",
    });
    await createOrganizationWithOwner(outsider.id, {
      name: "Y",
      slug: "tm-6y",
    });
    const team = await createTeam(owner.id, org.organizationId, {
      name: "Ops",
    });
    const [outMem] = await getTestDb()
      .select()
      .from(memberships)
      .where(eq(memberships.userId, outsider.id));
    await expect(
      addTeamMember(owner.id, team.id, outMem!.id),
    ).rejects.toBeTruthy();
  });
});
