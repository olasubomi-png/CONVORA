import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  users,
  memberships,
  automationExecutions,
  conversations,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createCustomer } from "@/lib/customers/create";
import { createConversation } from "@/lib/conversations/create";
import {
  createAutomationRule,
  listAutomationRules,
  setRuleEnabled,
  deleteAutomationRule,
} from "@/lib/automation/rules";
import { emitAutomationEvent } from "@/lib/automation/engine";
import { evaluateCondition } from "@/lib/automation/conditions";
import { AuthorizationError } from "@/lib/errors";
import { getTestDb, setupTestEnv, truncateAllTables } from "../helpers/db";
import type { AutomationContext } from "@/lib/automation/types";
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

describe("automation conditions", () => {
  it("evaluates equals and rejects unknown fields", () => {
    const ctx: AutomationContext = {
      organizationId: "00000000-0000-0000-0000-000000000001",
      conversation: { status: "OPEN" },
      event: { type: "conversation.created", key: "e1" },
      depth: 0,
    };
    expect(
      evaluateCondition(
        { field: "conversation.status", operator: "equals", value: "OPEN" },
        ctx,
      ),
    ).toBe(true);
    expect(() =>
      evaluateCondition(
        { field: "evil.__proto__", operator: "equals", value: "x" },
        ctx,
      ),
    ).toThrow();
  });
});

describe("automation rules authz", () => {
  it("agent cannot create rules", async () => {
    const owner = await seedUser("au1@example.com");
    const agent = await seedUser("au1a@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "AU",
      slug: "au-1",
    });
    await getTestDb().insert(memberships).values({
      organizationId: org.organizationId,
      userId: agent.id,
      role: "AGENT",
      status: "ACTIVE",
    });
    await expect(
      createAutomationRule(agent.id, org.organizationId, {
        name: "Nope",
        triggerType: "conversation.created",
        conditions: [],
        actions: [{ type: "set_priority", priority: "HIGH" }],
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("owner creates, disables, deletes", async () => {
    const owner = await seedUser("au2@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "AU2",
      slug: "au-2",
    });
    const { rule } = await createAutomationRule(owner.id, org.organizationId, {
      name: "Boost",
      triggerType: "conversation.created",
      conditions: [
        { field: "conversation.status", operator: "equals", value: "OPEN" },
      ],
      actions: [{ type: "set_priority", priority: "HIGH" }],
    });
    const listed = await listAutomationRules(owner.id, org.organizationId);
    expect(listed.some((r) => r.id === rule.id)).toBe(true);
    await setRuleEnabled(owner.id, rule.id, false);
    await deleteAutomationRule(owner.id, rule.id);
  });
});

describe("automation engine", () => {
  it("runs action and is idempotent on same eventKey", async () => {
    const owner = await seedUser("au3@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "AU3",
      slug: "au-3",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(
      owner.id,
      org.organizationId,
      { customerId: customer.id, initialMessage: "hi" },
    );
    await createAutomationRule(owner.id, org.organizationId, {
      name: "High",
      triggerType: "conversation.created",
      conditions: [],
      actions: [{ type: "set_priority", priority: "HIGH" }],
    });

    const r1 = await emitAutomationEvent({
      organizationId: org.organizationId,
      triggerType: "conversation.created",
      eventKey: `conv:${conversation.id}:created`,
      context: {
        conversationId: conversation.id,
        conversation: { status: "OPEN", priority: "NORMAL" },
      },
    });
    expect(r1.executions).toBe(1);

    const r2 = await emitAutomationEvent({
      organizationId: org.organizationId,
      triggerType: "conversation.created",
      eventKey: `conv:${conversation.id}:created`,
      context: {
        conversationId: conversation.id,
        conversation: { status: "OPEN", priority: "NORMAL" },
      },
    });
    expect(r2.executions).toBe(0);
    expect(r2.skipped).toBeGreaterThanOrEqual(1);

    const [conv] = await getTestDb()
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversation.id));
    expect(conv?.priority).toBe("HIGH");

    const execs = await getTestDb()
      .select()
      .from(automationExecutions)
      .where(eq(automationExecutions.organizationId, org.organizationId));
    expect(execs).toHaveLength(1);
  });

  it("concurrent same event yields one execution", async () => {
    const owner = await seedUser("au4@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "AU4",
      slug: "au-4",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(
      owner.id,
      org.organizationId,
      { customerId: customer.id, initialMessage: "c" },
    );
    await createAutomationRule(owner.id, org.organizationId, {
      name: "P",
      triggerType: "conversation.message_received",
      conditions: [],
      actions: [{ type: "set_priority", priority: "URGENT" }],
    });
    const key = `msg:${conversation.id}:1`;
    await Promise.all([
      emitAutomationEvent({
        organizationId: org.organizationId,
        triggerType: "conversation.message_received",
        eventKey: key,
        context: { conversationId: conversation.id },
      }),
      emitAutomationEvent({
        organizationId: org.organizationId,
        triggerType: "conversation.message_received",
        eventKey: key,
        context: { conversationId: conversation.id },
      }),
    ]);
    const execs = await getTestDb()
      .select()
      .from(automationExecutions)
      .where(eq(automationExecutions.organizationId, org.organizationId));
    expect(execs).toHaveLength(1);
  });

  it("stops at max automation depth", async () => {
    const owner = await seedUser("au5@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "AU5",
      slug: "au-5",
    });
    await createAutomationRule(owner.id, org.organizationId, {
      name: "Loop",
      triggerType: "conversation.status_changed",
      conditions: [],
      actions: [{ type: "set_conversation_status", status: "PENDING" }],
    });
    const result = await emitAutomationEvent({
      organizationId: org.organizationId,
      triggerType: "conversation.status_changed",
      eventKey: "depth-test",
      context: { depth: MAX_AUTOMATION_DEPTH },
    });
    expect(result.executions).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
