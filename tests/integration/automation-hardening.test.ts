import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  users,
  memberships,
  conversations,
  conversationTags,
  conversationTagLinks,
  conversationNotes,
  automationExecutions,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createCustomer } from "@/lib/customers/create";
import { createConversation } from "@/lib/conversations/create";
import {
  createAutomationRule,
  updateAutomationRule,
} from "@/lib/automation/rules";
import { emitAutomationEvent } from "@/lib/automation/engine";
import { parseActionsStrict } from "@/lib/automation/validation";
import { AuthorizationError } from "@/lib/errors";
import { getTestDb, setupTestEnv, truncateAllTables } from "../helpers/db";
import { MAX_AUTOMATION_DEPTH } from "@/lib/automation/types";

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

describe("action validation", () => {
  it("rejects unknown action types", () => {
    expect(() =>
      parseActionsStrict([{ type: "eval", code: "1+1" }]),
    ).toThrow();
    expect(() =>
      parseActionsStrict([{ type: "set_priority", priority: "LOW" }]),
    ).toThrow();
  });
});

describe("real actions", () => {
  it("assigns conversation and adds tag", async () => {
    const owner = await seedUser("ah-a@example.com");
    const agent = await seedUser("ah-ag@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "AHA",
      slug: "ah-a",
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
      { customerId: customer.id, initialMessage: "x" },
    );
    const [tag] = await getTestDb()
      .insert(conversationTags)
      .values({
        organizationId: org.organizationId,
        name: "Hot",
        slug: "hot",
      })
      .returning();

    await createAutomationRule(owner.id, org.organizationId, {
      name: "Assign+Tag",
      triggerType: "conversation.message_received",
      conditions: [],
      actions: [
        { type: "assign_conversation", membershipId: agentMem!.id },
        { type: "add_tag", tagId: tag!.id },
        { type: "add_internal_note", body: "Auto note" },
      ],
    });

    await emitAutomationEvent({
      organizationId: org.organizationId,
      triggerType: "conversation.message_received",
      eventKey: `msg:${conversation.id}:1`,
      context: {
        conversationId: conversation.id,
        customerId: customer.id,
      },
    });

    const [conv] = await getTestDb()
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversation.id));
    expect(conv?.assignedToMembershipId).toBe(agentMem!.id);

    const links = await getTestDb()
      .select()
      .from(conversationTagLinks)
      .where(eq(conversationTagLinks.conversationId, conversation.id));
    expect(links.some((l) => l.tagId === tag!.id)).toBe(true);

    const notes = await getTestDb()
      .select()
      .from(conversationNotes)
      .where(eq(conversationNotes.conversationId, conversation.id));
    expect(notes.some((n) => n.body.includes("Auto note"))).toBe(true);
  });

  it("rejects cross-org assign membership", async () => {
    const ownerA = await seedUser("ah-xa@example.com");
    const ownerB = await seedUser("ah-xb@example.com");
    const orgA = await createOrganizationWithOwner(ownerA.id, {
      name: "XA",
      slug: "ah-xa",
    });
    await createOrganizationWithOwner(ownerB.id, {
      name: "XB",
      slug: "ah-xb",
    });
    const [memB] = await getTestDb()
      .select()
      .from(memberships)
      .where(eq(memberships.userId, ownerB.id));
    const customer = await createCustomer(orgA.organizationId, ownerA.id, {
      displayName: "C",
    });
    const conversation = await createConversation(
      ownerA.id,
      orgA.organizationId,
      { customerId: customer.id, initialMessage: "x" },
    );
    await createAutomationRule(ownerA.id, orgA.organizationId, {
      name: "Bad",
      triggerType: "conversation.message_received",
      conditions: [],
      actions: [
        { type: "assign_conversation", membershipId: memB!.id },
      ],
    });
    await emitAutomationEvent({
      organizationId: orgA.organizationId,
      triggerType: "conversation.message_received",
      eventKey: `msg:${conversation.id}:cross`,
      context: { conversationId: conversation.id },
    });
    const execs = await getTestDb()
      .select()
      .from(automationExecutions)
      .where(eq(automationExecutions.organizationId, orgA.organizationId));
    expect(execs[0]?.status).toBe("FAILED");
  });
});

describe("rule update", () => {
  it("updates conditions atomically", async () => {
    const owner = await seedUser("ah-u@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "U",
      slug: "ah-u",
    });
    const { rule } = await createAutomationRule(owner.id, org.organizationId, {
      name: "Old",
      triggerType: "conversation.created",
      conditions: [],
      actions: [{ type: "set_priority", priority: "HIGH" }],
    });
    await updateAutomationRule(owner.id, rule.id, {
      name: "New",
      conditions: [
        { field: "conversation.status", operator: "equals", value: "OPEN" },
      ],
    });
  });

  it("agent cannot update", async () => {
    const owner = await seedUser("ah-ua@example.com");
    const agent = await seedUser("ah-uag@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "UA",
      slug: "ah-ua",
    });
    await getTestDb().insert(memberships).values({
      organizationId: org.organizationId,
      userId: agent.id,
      role: "AGENT",
      status: "ACTIVE",
    });
    const { rule } = await createAutomationRule(owner.id, org.organizationId, {
      name: "R",
      triggerType: "conversation.created",
      conditions: [],
      actions: [{ type: "set_priority", priority: "HIGH" }],
    });
    await expect(
      updateAutomationRule(agent.id, rule.id, { name: "Hacked" }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("depth", () => {
  it("skips at max depth", async () => {
    const owner = await seedUser("ah-d@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "D",
      slug: "ah-d",
    });
    await createAutomationRule(owner.id, org.organizationId, {
      name: "Deep",
      triggerType: "conversation.status_changed",
      conditions: [],
      actions: [{ type: "set_priority", priority: "URGENT" }],
    });
    const r = await emitAutomationEvent({
      organizationId: org.organizationId,
      triggerType: "conversation.status_changed",
      eventKey: "deep",
      context: { depth: MAX_AUTOMATION_DEPTH },
    });
    expect(r.executions).toBe(0);
  });
});
