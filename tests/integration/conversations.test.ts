import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { users, memberships } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createCustomer } from "@/lib/customers/create";
import { createConversation } from "@/lib/conversations/create";
import { sendAgentMessage, listMessages } from "@/lib/conversations/messages";
import { addInternalNote, listInternalNotes } from "@/lib/conversations/notes";
import { assignConversation } from "@/lib/conversations/assignments";
import { changeConversationStatus } from "@/lib/conversations/update";
import {
  createOrganizationTag,
  addConversationTag,
} from "@/lib/conversations/tags";
import { listOrganizationConversations } from "@/lib/conversations/list";
import { markConversationRead } from "@/lib/conversations/read-state";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
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

describe("conversation engine", () => {
  it("creates customer and conversation within tenant", async () => {
    const owner = await seedUser("c1@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "C1",
      slug: "c1-org",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "Jane Customer",
      email: "jane@example.com",
    });
    const conversation = await createConversation(owner.id, org.organizationId, {
      customerId: customer.id,
      subject: "Help",
      initialMessage: "Hello from agent",
    });
    expect(conversation.organizationId).toBe(org.organizationId);
    const msgs = await listMessages(owner.id, conversation.id);
    expect(msgs.messages.length).toBe(1);
  });

  it("blocks cross-tenant conversation access", async () => {
    const a = await seedUser("ca@example.com");
    const b = await seedUser("cb@example.com");
    const orgA = await createOrganizationWithOwner(a.id, {
      name: "A",
      slug: "conv-a",
    });
    const orgB = await createOrganizationWithOwner(b.id, {
      name: "B",
      slug: "conv-b",
    });
    const customer = await createCustomer(orgA.organizationId, a.id, {
      displayName: "Cust",
    });
    const conversation = await createConversation(a.id, orgA.organizationId, {
      customerId: customer.id,
    });
    await expect(
      listMessages(b.id, conversation.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      sendAgentMessage(b.id, conversation.id, "hack"),
    ).rejects.toBeInstanceOf(NotFoundError);
    void orgB;
  });

  it("keeps internal notes separate from messages", async () => {
    const owner = await seedUser("note@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "N",
      slug: "note-org",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(owner.id, org.organizationId, {
      customerId: customer.id,
      initialMessage: "Public to customer",
    });
    await addInternalNote(owner.id, conversation.id, "Secret staff note");
    const msgs = await listMessages(owner.id, conversation.id);
    const notes = await listInternalNotes(owner.id, conversation.id);
    expect(msgs.messages.every((m) => m.body !== "Secret staff note")).toBe(
      true,
    );
    expect(notes.some((n) => n.body === "Secret staff note")).toBe(true);
  });

  it("enforces assignment tenancy", async () => {
    const a = await seedUser("aa@example.com");
    const b = await seedUser("bb@example.com");
    const orgA = await createOrganizationWithOwner(a.id, {
      name: "A",
      slug: "asgn-a",
    });
    const orgB = await createOrganizationWithOwner(b.id, {
      name: "B",
      slug: "asgn-b",
    });
    const customer = await createCustomer(orgA.organizationId, a.id, {
      displayName: "C",
    });
    const conversation = await createConversation(a.id, orgA.organizationId, {
      customerId: customer.id,
    });
    await expect(
      assignConversation(a.id, conversation.id, orgB.membershipId),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("prevents attaching foreign tags", async () => {
    const a = await seedUser("ta@example.com");
    const b = await seedUser("tb@example.com");
    const orgA = await createOrganizationWithOwner(a.id, {
      name: "A",
      slug: "tag-a",
    });
    const orgB = await createOrganizationWithOwner(b.id, {
      name: "B",
      slug: "tag-b",
    });
    const customer = await createCustomer(orgA.organizationId, a.id, {
      displayName: "C",
    });
    const conversation = await createConversation(a.id, orgA.organizationId, {
      customerId: customer.id,
    });
    const tagB = await createOrganizationTag(b.id, orgB.organizationId, "VIP");
    await expect(
      addConversationTag(a.id, conversation.id, tagB.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("validates status transitions and reopening", async () => {
    const owner = await seedUser("st@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "S",
      slug: "st-org",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(owner.id, org.organizationId, {
      customerId: customer.id,
    });
    await changeConversationStatus(owner.id, conversation.id, "CLOSED");
    await expect(
      sendAgentMessage(owner.id, conversation.id, "nope"),
    ).rejects.toBeInstanceOf(ValidationError);
    await changeConversationStatus(owner.id, conversation.id, "OPEN");
    await expect(
      sendAgentMessage(owner.id, conversation.id, "ok"),
    ).resolves.toBeTruthy();
  });

  it("isolates read state per membership", async () => {
    const owner = await seedUser("rd@example.com");
    const agent = await seedUser("rd-ag@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "R",
      slug: "rd-org",
    });
    await getTestDb().insert(memberships).values({
      userId: agent.id,
      organizationId: org.organizationId,
      role: "AGENT",
      status: "ACTIVE",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(owner.id, org.organizationId, {
      customerId: customer.id,
      initialMessage: "Hi",
    });
    await markConversationRead(owner.id, conversation.id);
    const listOwner = await listOrganizationConversations(
      owner.id,
      org.organizationId,
    );
    const listAgent = await listOrganizationConversations(
      agent.id,
      org.organizationId,
    );
    const rowOwner = listOwner.conversations.find(
      (c) => c.id === conversation.id,
    );
    const rowAgent = listAgent.conversations.find(
      (c) => c.id === conversation.id,
    );
    expect(rowOwner?.unread).toBe(false);
    expect(rowAgent?.unread).toBe(true);
  });

  it("handles concurrent assignment consistently", async () => {
    const owner = await seedUser("conc@example.com");
    const agent = await seedUser("conc-ag@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "CC",
      slug: "conc-org",
    });
    const [agentMem] = await getTestDb()
      .insert(memberships)
      .values({
        userId: agent.id,
        organizationId: org.organizationId,
        role: "AGENT",
        status: "ACTIVE",
      })
      .returning();
    if (!agentMem) throw new Error("mem");
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(owner.id, org.organizationId, {
      customerId: customer.id,
    });

    await Promise.all([
      assignConversation(owner.id, conversation.id, org.membershipId),
      assignConversation(agent.id, conversation.id, agentMem.id),
    ]);

    const list = await listOrganizationConversations(
      owner.id,
      org.organizationId,
    );
    const row = list.conversations.find((c) => c.id === conversation.id);
    expect(
      row?.assignedToMembershipId === org.membershipId ||
        row?.assignedToMembershipId === agentMem.id,
    ).toBe(true);
  });
});
