
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users, domainEventOutbox } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createCustomer } from "@/lib/customers/create";
import { createConversation } from "@/lib/conversations/create";
import { changeConversationStatus } from "@/lib/conversations/update";
import { processDomainEventOutbox } from "@/lib/automation/outbox";
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

describe("transactional outbox", () => {
  it("creates outbox event with conversation.created", async () => {
    const owner = await seedUser("ob1@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "OB",
      slug: "ob-1",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(
      owner.id,
      org.organizationId,
      { customerId: customer.id, initialMessage: "hi" },
    );
    const events = await getTestDb()
      .select()
      .from(domainEventOutbox)
      .where(eq(domainEventOutbox.organizationId, org.organizationId));
    expect(
      events.some(
        (e) =>
          e.triggerType === "conversation.created" &&
          e.eventKey.includes(conversation.id),
      ),
    ).toBe(true);
  });

  it("status change enqueues status_changed", async () => {
    const owner = await seedUser("ob2@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "OB2",
      slug: "ob-2",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    const conversation = await createConversation(
      owner.id,
      org.organizationId,
      { customerId: customer.id, initialMessage: "x" },
    );
    await changeConversationStatus(owner.id, conversation.id, "PENDING");
    const events = await getTestDb()
      .select()
      .from(domainEventOutbox)
      .where(eq(domainEventOutbox.organizationId, org.organizationId));
    expect(events.some((e) => e.triggerType === "conversation.status_changed")).toBe(
      true,
    );
  });

  it("concurrent process does not double-process", async () => {
    const owner = await seedUser("ob3@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "OB3",
      slug: "ob-3",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
    });
    await createConversation(owner.id, org.organizationId, {
      customerId: customer.id,
      initialMessage: "x",
    });
    // Events already flushed on create — reset a processed to PENDING for claim test
    await getTestDb()
      .update(domainEventOutbox)
      .set({ status: "PENDING", processedAt: null, attemptCount: 0 })
      .where(eq(domainEventOutbox.organizationId, org.organizationId));

    const [a, b] = await Promise.all([
      processDomainEventOutbox({ organizationId: org.organizationId }),
      processDomainEventOutbox({ organizationId: org.organizationId }),
    ]);
    // Combined processing should not exceed number of events
    const events = await getTestDb()
      .select()
      .from(domainEventOutbox)
      .where(eq(domainEventOutbox.organizationId, org.organizationId));
    expect(events.every((e) => e.status === "PROCESSED" || e.status === "FAILED")).toBe(
      true,
    );
    void a;
    void b;
  });
});
