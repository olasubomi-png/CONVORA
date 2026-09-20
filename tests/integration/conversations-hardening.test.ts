import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import {
  users,
  memberships,
  conversationAssignments,
  conversations,
  messages,
  auditEvents,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createCustomer } from "@/lib/customers/create";
import { createConversation } from "@/lib/conversations/create";
import {
  sendAgentMessage,
  listMessages,
} from "@/lib/conversations/messages";
import { assignConversation } from "@/lib/conversations/assignments";
import { markConversationRead } from "@/lib/conversations/read-state";
import { listOrganizationConversations } from "@/lib/conversations/list";
import { changeConversationStatus } from "@/lib/conversations/update";
import {
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import {
  encodeTimeIdCursor,
  decodeTimeIdCursor,
} from "@/lib/conversations/cursors";
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

async function setupOrgWithConversation(email: string) {
  const owner = await seedUser(email);
  const org = await createOrganizationWithOwner(owner.id, {
    name: email,
    slug: email.replace(/[^a-z0-9]/g, "-").slice(0, 20),
  });
  const customer = await createCustomer(org.organizationId, owner.id, {
    displayName: "Customer",
  });
  const conversation = await createConversation(owner.id, org.organizationId, {
    customerId: customer.id,
  });
  return { owner, org, customer, conversation };
}

describe("assignment concurrency", () => {
  it("leaves exactly one active assignment after concurrent assigns", async () => {
    const owner = await seedUser("asgn-o@example.com");
    const agent = await seedUser("asgn-a@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "Asgn",
      slug: "asgn-conc",
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

    const history = await getTestDb()
      .select()
      .from(conversationAssignments)
      .where(eq(conversationAssignments.conversationId, conversation.id));
    expect(history.length).toBeGreaterThanOrEqual(1);
  });
});

describe("read state hardening", () => {
  it("rejects message IDs from another conversation", async () => {
    const a = await setupOrgWithConversation("rd1@example.com");
    const b = await setupOrgWithConversation("rd2@example.com");
    const msgB = await sendAgentMessage(
      b.owner.id,
      b.conversation.id,
      "other conv",
    );
    await expect(
      markConversationRead(a.owner.id, a.conversation.id, msgB.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("accepts valid message ID on the same conversation", async () => {
    const a = await setupOrgWithConversation("rd3@example.com");
    const msg = await sendAgentMessage(
      a.owner.id,
      a.conversation.id,
      "hello",
    );
    await expect(
      markConversationRead(a.owner.id, a.conversation.id, msg.id),
    ).resolves.toBeUndefined();
  });
});

describe("message pagination", () => {
  it("paginates with before and after using deterministic cursors", async () => {
    const { owner, conversation } = await setupOrgWithConversation(
      "page@example.com",
    );
    const bodies: string[] = [];
    for (let i = 0; i < 5; i++) {
      const m = await sendAgentMessage(
        owner.id,
        conversation.id,
        `msg-${i}`,
      );
      bodies.push(m.id);
    }

    const first = await listMessages(owner.id, conversation.id, { limit: 2 });
    expect(first.messages).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();

    const older = await listMessages(owner.id, conversation.id, {
      limit: 2,
      before: first.nextCursor!,
    });
    expect(older.messages.length).toBeGreaterThan(0);

    const newest = first.messages[first.messages.length - 1]!;
    const newer = await listMessages(owner.id, conversation.id, {
      limit: 5,
      after: encodeTimeIdCursor(newest.createdAt, newest.id),
    });
    // after the last of first page should yield nothing or only newer
    expect(newer.messages.every((m) => m.createdAt >= newest.createdAt)).toBe(
      true,
    );
  });

  it("rejects malformed cursors", async () => {
    const { owner, conversation } = await setupOrgWithConversation(
      "badcur@example.com",
    );
    await expect(
      listMessages(owner.id, conversation.id, { before: "not-a-cursor" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("excludes deleted messages", async () => {
    const { owner, conversation } = await setupOrgWithConversation(
      "del@example.com",
    );
    const msg = await sendAgentMessage(owner.id, conversation.id, "visible");
    await getTestDb()
      .update(messages)
      .set({ deletedAt: new Date() })
      .where(eq(messages.id, msg.id));
    const list = await listMessages(owner.id, conversation.id);
    expect(list.messages.find((m) => m.id === msg.id)).toBeUndefined();
  });
});

describe("closedAt semantics", () => {
  it("sets and clears closedAt on close/reopen", async () => {
    const { owner, conversation } = await setupOrgWithConversation(
      "closed@example.com",
    );
    const closed = await changeConversationStatus(
      owner.id,
      conversation.id,
      "CLOSED",
    );
    expect(closed?.closedAt).toBeTruthy();
    await expect(
      sendAgentMessage(owner.id, conversation.id, "nope"),
    ).rejects.toBeInstanceOf(ValidationError);

    const reopened = await changeConversationStatus(
      owner.id,
      conversation.id,
      "OPEN",
    );
    expect(reopened?.closedAt).toBeNull();
    await expect(
      sendAgentMessage(owner.id, conversation.id, "ok"),
    ).resolves.toBeTruthy();
  });
});

describe("transactional audit", () => {
  it("records CONVERSATION_CREATED audit on success", async () => {
    const { owner, conversation, org } = await setupOrgWithConversation(
      "aud@example.com",
    );
    const events = await getTestDb()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "CONVERSATION_CREATED"));
    expect(
      events.some(
        (e) =>
          e.organizationId === org.organizationId &&
          (e.payload as { conversationId?: string }).conversationId ===
            conversation.id,
      ),
    ).toBe(true);
    void owner;
  });
});

describe("cursor codec", () => {
  it("round-trips", () => {
    const d = new Date("2024-06-01T12:00:00.000Z");
    const id = "11111111-1111-1111-1111-111111111111";
    const enc = encodeTimeIdCursor(d, id);
    const dec = decodeTimeIdCursor(enc);
    expect(dec.id).toBe(id);
    expect(dec.createdAt.toISOString()).toBe(d.toISOString());
  });
});

describe("conversation list pagination", () => {
  it("returns bounded pages with stable cursors", async () => {
    const owner = await seedUser("listp@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "LP",
      slug: "list-page",
    });
    for (let i = 0; i < 4; i++) {
      const c = await createCustomer(org.organizationId, owner.id, {
        displayName: `C${i}`,
      });
      await createConversation(owner.id, org.organizationId, {
        customerId: c.id,
        subject: `S${i}`,
      });
    }
    const page1 = await listOrganizationConversations(
      owner.id,
      org.organizationId,
      { limit: 2 },
    );
    expect(page1.conversations).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = await listOrganizationConversations(
      owner.id,
      org.organizationId,
      { limit: 2, cursor: page1.nextCursor! },
    );
    const ids1 = new Set(page1.conversations.map((c) => c.id));
    for (const c of page2.conversations) {
      expect(ids1.has(c.id)).toBe(false);
    }
  });
});
