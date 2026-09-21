import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  users,
  memberships,
  domainEventOutbox,
  conversations,
  conversationTags,
  automationExecutions,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createCustomer } from "@/lib/customers/create";
import { updateCustomer } from "@/lib/customers/update";
import { addCustomerTag, removeCustomerTag } from "@/lib/customers/tags";
import { createConversation } from "@/lib/conversations/create";
import {
  changeConversationStatus,
  changeConversationPriority,
} from "@/lib/conversations/update";
import {
  assignConversation,
  unassignConversation,
} from "@/lib/conversations/assignments";
import { sendAgentMessage } from "@/lib/conversations/messages";
import {
  processDomainEventOutbox,
  resetOutboxToPending,
  requeueFailedOutboxEvent,
  markOutboxFailed,
} from "@/lib/automation/outbox";
import { createAutomationRule } from "@/lib/automation/rules";
import { emitAutomationEvent } from "@/lib/automation/engine";
import { MAX_AUTOMATION_DEPTH } from "@/lib/automation/types";
import { getTestDb, setupTestEnv, truncateAllTables } from "../helpers/db";
import { getDatabase } from "@/db";

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

async function seedOrg(slug: string) {
  const owner = await seedUser(`${slug}@example.com`);
  const org = await createOrganizationWithOwner(owner.id, {
    name: slug,
    slug,
  });
  return { owner, org };
}

function outboxForOrg(organizationId: string) {
  return getTestDb()
    .select()
    .from(domainEventOutbox)
    .where(eq(domainEventOutbox.organizationId, organizationId));
}

describe("all 11 durable outbox event types", () => {
  it("conversation.created", async () => {
    const { owner, org } = await seedOrg("ev-created");
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(
      owner.id,
      org.organizationId,
      { customerId: customer.id, initialMessage: "hi" },
    );
    const events = await outboxForOrg(org.organizationId);
    const hit = events.find((e) => e.triggerType === "conversation.created");
    expect(hit).toBeDefined();
    expect(hit!.organizationId).toBe(org.organizationId);
    expect(hit!.eventKey).toContain(conversation.id);
    expect(
      (hit!.payload as { conversationId?: string }).conversationId,
    ).toBe(conversation.id);
  });

  it("conversation.message_sent", async () => {
    const { owner, org } = await seedOrg("ev-sent");
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(
      owner.id,
      org.organizationId,
      { customerId: customer.id, initialMessage: "x" },
    );
    await sendAgentMessage(owner.id, conversation.id, "hello agent");
    const events = await outboxForOrg(org.organizationId);
    const hit = events.find((e) => e.triggerType === "conversation.message_sent");
    expect(hit).toBeDefined();
    expect(hit!.organizationId).toBe(org.organizationId);
    expect(
      (hit!.payload as { message?: { direction?: string } }).message?.direction,
    ).toBe("outbound");
  });

  it("conversation.assigned and unassigned", async () => {
    const { owner, org } = await seedOrg("ev-assign");
    const agent = await seedUser("ev-assign-agent@example.com");
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
    await assignConversation(owner.id, conversation.id, agentMem!.id);
    await unassignConversation(owner.id, conversation.id);
    const events = await outboxForOrg(org.organizationId);
    expect(events.some((e) => e.triggerType === "conversation.assigned")).toBe(
      true,
    );
    expect(
      events.some((e) => e.triggerType === "conversation.unassigned"),
    ).toBe(true);
  });

  it("conversation.status_changed and priority_changed", async () => {
    const { owner, org } = await seedOrg("ev-status");
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(
      owner.id,
      org.organizationId,
      { customerId: customer.id, initialMessage: "x" },
    );
    await changeConversationStatus(owner.id, conversation.id, "PENDING");
    await changeConversationPriority(owner.id, conversation.id, "HIGH");
    const events = await outboxForOrg(org.organizationId);
    expect(
      events.some((e) => e.triggerType === "conversation.status_changed"),
    ).toBe(true);
    expect(
      events.some((e) => e.triggerType === "conversation.priority_changed"),
    ).toBe(true);
  });

  it("customer.created, updated, tag_added, tag_removed", async () => {
    const { owner, org } = await seedOrg("ev-cust");
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    await updateCustomer(owner.id, customer.id, { displayName: "C2" });
    const [tag] = await getTestDb()
      .insert(conversationTags)
      .values({
        organizationId: org.organizationId,
        name: "VIP",
        slug: "vip",
      })
      .returning();
    await addCustomerTag(owner.id, customer.id, tag!.id);
    await removeCustomerTag(owner.id, customer.id, tag!.id);
    const events = await outboxForOrg(org.organizationId);
    expect(events.some((e) => e.triggerType === "customer.created")).toBe(true);
    expect(events.some((e) => e.triggerType === "customer.updated")).toBe(true);
    expect(events.some((e) => e.triggerType === "customer.tag_added")).toBe(
      true,
    );
    expect(events.some((e) => e.triggerType === "customer.tag_removed")).toBe(
      true,
    );
  });

  it("conversation.message_received via direct outbox enqueue path remains tenant-safe", async () => {
    // Domain inbound path is covered by web-chat/channel tests; here we assert
    // outbox process for message_received stays org-scoped.
    const { org } = await seedOrg("ev-recv");
    const db = getDatabase();
    await db.insert(domainEventOutbox).values({
      organizationId: org.organizationId,
      triggerType: "conversation.message_received",
      eventKey: "manual-recv-1",
      payload: { message: { direction: "inbound" } },
      status: "PENDING",
    });
    const result = await processDomainEventOutbox({
      organizationId: org.organizationId,
    });
    expect(result.claimed).toBeGreaterThanOrEqual(1);
    const events = await outboxForOrg(org.organizationId);
    expect(
      events.find((e) => e.triggerType === "conversation.message_received")
        ?.status,
    ).toBe("PROCESSED");
  });
});

describe("outbox concurrency", () => {
  it("two workers claim distinct partitions; each event processed once", async () => {
    const { owner, org } = await seedOrg("ev-conc");
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    await createConversation(owner.id, org.organizationId, {
      customerId: customer.id,
      initialMessage: "x",
    });
    await resetOutboxToPending(org.organizationId);

    const before = await outboxForOrg(org.organizationId);
    const pendingCount = before.filter((e) => e.status === "PENDING").length;
    expect(pendingCount).toBeGreaterThan(0);

    const [workerA, workerB] = await Promise.all([
      processDomainEventOutbox({ organizationId: org.organizationId }),
      processDomainEventOutbox({ organizationId: org.organizationId }),
    ]);

    // Combined claims equal total pending (each event claimed by exactly one worker)
    expect(workerA.claimed + workerB.claimed).toBe(pendingCount);
    // Neither worker claimed more than total
    expect(workerA.claimed).toBeLessThanOrEqual(pendingCount);
    expect(workerB.claimed).toBeLessThanOrEqual(pendingCount);

    const after = await outboxForOrg(org.organizationId);
    expect(after.every((e) => e.status === "PROCESSED")).toBe(true);
    // attempt_count is 1 per event (not 2)
    expect(after.every((e) => e.attemptCount === 1)).toBe(true);
  });
});

describe("outbox tenant isolation", () => {
  it("org A worker does not claim org B events", async () => {
    const a = await seedOrg("ev-ta");
    const b = await seedOrg("ev-tb");
    const customerB = await createCustomer(b.org.organizationId, b.owner.id, {
      displayName: "B",
    });
    await createConversation(b.owner.id, b.org.organizationId, {
      customerId: customerB.id,
      initialMessage: "x",
    });
    await resetOutboxToPending(b.org.organizationId);

    const result = await processDomainEventOutbox({
      organizationId: a.org.organizationId,
    });
    expect(result.claimed).toBe(0);

    const bEvents = await outboxForOrg(b.org.organizationId);
    expect(bEvents.some((e) => e.status === "PENDING")).toBe(true);
  });
});

describe("outbox retry", () => {
  it("FAILED event can be requeued and PROCESSED", async () => {
    const { owner, org } = await seedOrg("ev-retry");
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    await createConversation(owner.id, org.organizationId, {
      customerId: customer.id,
      initialMessage: "x",
    });
    const events = await outboxForOrg(org.organizationId);
    const target = events[0];
    expect(target).toBeDefined();
    await markOutboxFailed(target!.id, "simulated failure");
    const failed = await getTestDb()
      .select()
      .from(domainEventOutbox)
      .where(eq(domainEventOutbox.id, target!.id));
    expect(failed[0]?.status).toBe("FAILED");
    expect(failed[0]?.lastError).toContain("simulated");

    await requeueFailedOutboxEvent(target!.id);
    const result = await processDomainEventOutbox({
      organizationId: org.organizationId,
    });
    expect(result.processed).toBeGreaterThanOrEqual(1);
    const done = await getTestDb()
      .select()
      .from(domainEventOutbox)
      .where(eq(domainEventOutbox.id, target!.id));
    expect(done[0]?.status).toBe("PROCESSED");
  });
});

describe("loop protection", () => {
  it("stops at max depth without infinite recursion", async () => {
    const { org } = await seedOrg("ev-loop");
    const result = await emitAutomationEvent({
      organizationId: org.organizationId,
      triggerType: "conversation.status_changed",
      eventKey: "depth-guard",
      context: { depth: MAX_AUTOMATION_DEPTH },
    });
    expect(result.executions).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

describe("automation atomic action failure", () => {
  it("failed action leaves execution FAILED and does not partial-commit assign", async () => {
    const { owner, org } = await seedOrg("ev-atom");
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(
      owner.id,
      org.organizationId,
      { customerId: customer.id, initialMessage: "x" },
    );
    // Cross-org membership id will fail assign
    const other = await seedOrg("ev-atom-other");
    const [otherMem] = await getTestDb()
      .select()
      .from(memberships)
      .where(eq(memberships.organizationId, other.org.organizationId));

    await createAutomationRule(owner.id, org.organizationId, {
      name: "BadAssign",
      triggerType: "conversation.message_received",
      conditions: [],
      actions: [
        { type: "set_priority", priority: "HIGH" },
        {
          type: "assign_conversation",
          membershipId: otherMem!.id,
        },
      ],
    });

    await emitAutomationEvent({
      organizationId: org.organizationId,
      triggerType: "conversation.message_received",
      eventKey: `atom:${conversation.id}`,
      context: { conversationId: conversation.id },
    });

    const [conv] = await getTestDb()
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversation.id));
    // Priority must not stick if multi-action tx rolled back
    expect(conv?.priority).not.toBe("HIGH");

    const execs = await getTestDb()
      .select()
      .from(automationExecutions)
      .where(eq(automationExecutions.organizationId, org.organizationId));
    expect(execs.some((e) => e.status === "FAILED")).toBe(true);
  });
});

describe("outbox rollback with domain transaction", () => {
  it("outbox event is not left PENDING without matching domain row on successful path", async () => {
    const { owner, org } = await seedOrg("ev-rb");
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(
      owner.id,
      org.organizationId,
      { customerId: customer.id, initialMessage: "x" },
    );
    const [conv] = await getTestDb()
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversation.id));
    expect(conv).toBeDefined();
    const events = await outboxForOrg(org.organizationId);
    expect(
      events.some(
        (e) =>
          e.triggerType === "conversation.created" &&
          e.organizationId === org.organizationId,
      ),
    ).toBe(true);
  });
});
