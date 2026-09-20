import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createCustomer } from "@/lib/customers/create";
import { updateCustomer } from "@/lib/customers/update";
import { listCustomers, getCustomerDetail } from "@/lib/customers/list";
import { addCustomerNote, listCustomerNotes } from "@/lib/customers/notes";
import {
  createOrganizationTag,
} from "@/lib/conversations/tags";
import { addCustomerTag, listCustomerTags } from "@/lib/customers/tags";
import {
  createAttributeDefinition,
  setCustomerAttributes,
  getCustomerAttributes,
} from "@/lib/customers/attributes";
import { getCustomerStats } from "@/lib/customers/stats";
import { listCustomerActivity } from "@/lib/customers/activity";
import { mergeCustomers } from "@/lib/customers/merge";
import { createConversation } from "@/lib/conversations/create";
import {
  ConflictError,
  NotFoundError,
  AuthorizationError,
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

describe("customer intelligence", () => {
  it("creates and retrieves organization-scoped customers", async () => {
    const owner = await seedUser("cu1@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "C",
      slug: "cust-1",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "Jane Doe",
      email: "Jane@Example.com",
      companyName: "Acme",
    });
    expect(customer.email).toBe("jane@example.com");
    const detail = await getCustomerDetail(owner.id, customer.id);
    expect(detail.customer.displayName).toBe("Jane Doe");
  });

  it("enforces org-scoped email uniqueness", async () => {
    const owner = await seedUser("cu2@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "C",
      slug: "cust-2",
    });
    await createCustomer(org.organizationId, owner.id, {
      displayName: "A",
      email: "same@example.com",
    });
    await expect(
      createCustomer(org.organizationId, owner.id, {
        displayName: "B",
        email: "same@example.com",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("blocks cross-tenant access", async () => {
    const a = await seedUser("cta@example.com");
    const b = await seedUser("ctb@example.com");
    const orgA = await createOrganizationWithOwner(a.id, {
      name: "A",
      slug: "ct-a",
    });
    await createOrganizationWithOwner(b.id, { name: "B", slug: "ct-b" });
    const customer = await createCustomer(orgA.organizationId, a.id, {
      displayName: "Secret",
    });
    await expect(
      getCustomerDetail(b.id, customer.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      updateCustomer(b.id, customer.id, { displayName: "Hacked" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      addCustomerNote(b.id, customer.id, "nope"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("searches by name email phone company", async () => {
    const owner = await seedUser("search@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "S",
      slug: "search-org",
    });
    await createCustomer(org.organizationId, owner.id, {
      displayName: "Alpha One",
      email: "alpha@x.com",
    });
    await createCustomer(org.organizationId, owner.id, {
      displayName: "Beta Two",
      companyName: "Zeta Corp",
    });
    const r = await listCustomers(owner.id, org.organizationId, {
      q: "zeta",
    });
    expect(r.customers).toHaveLength(1);
    expect(r.customers[0]?.displayName).toBe("Beta Two");
  });

  it("supports notes tags attributes stats activity", async () => {
    const owner = await seedUser("full@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "F",
      slug: "full-org",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "Full",
    });
    await addCustomerNote(owner.id, customer.id, "Internal only");
    const notes = await listCustomerNotes(owner.id, customer.id);
    expect(notes[0]?.body).toBe("Internal only");

    const tag = await createOrganizationTag(
      owner.id,
      org.organizationId,
      "VIP",
    );
    await addCustomerTag(owner.id, customer.id, tag.id);
    const tags = await listCustomerTags(owner.id, customer.id);
    expect(tags.some((t) => t.slug === "vip")).toBe(true);

    await createAttributeDefinition(owner.id, org.organizationId, {
      key: "industry",
      label: "Industry",
      type: "TEXT",
    });
    await setCustomerAttributes(owner.id, customer.id, {
      industry: "Real Estate",
    });
    const attrs = await getCustomerAttributes(owner.id, customer.id);
    expect(attrs.find((a) => a.key === "industry")?.value).toBe("Real Estate");

    await createConversation(owner.id, org.organizationId, {
      customerId: customer.id,
      initialMessage: "Hi",
    });
    const stats = await getCustomerStats(owner.id, customer.id);
    expect(stats.totalConversations).toBe(1);
    expect(stats.totalMessages).toBe(1);

    const activity = await listCustomerActivity(owner.id, customer.id);
    expect(activity.events.length).toBeGreaterThan(0);
  });

  it("merges customers within organization", async () => {
    const owner = await seedUser("merge@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "M",
      slug: "merge-org",
    });
    const canonical = await createCustomer(org.organizationId, owner.id, {
      displayName: "Canonical",
    });
    const source = await createCustomer(org.organizationId, owner.id, {
      displayName: "Source",
      email: "source@example.com",
    });
    await createConversation(owner.id, org.organizationId, {
      customerId: source.id,
    });
    await mergeCustomers(owner.id, canonical.id, source.id);
    const stats = await getCustomerStats(owner.id, canonical.id);
    expect(stats.totalConversations).toBe(1);
  });

  it("rejects agent-less merge by non-admin if role restricted", async () => {
    // AGENT cannot merge
    const owner = await seedUser("mrg-o@example.com");
    const agent = await seedUser("mrg-a@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "MR",
      slug: "mrg-org",
    });
    const { memberships } = await import("@/db/schema");
    await getTestDb().insert(memberships).values({
      userId: agent.id,
      organizationId: org.organizationId,
      role: "AGENT",
      status: "ACTIVE",
    });
    const a = await createCustomer(org.organizationId, owner.id, {
      displayName: "A",
    });
    const b = await createCustomer(org.organizationId, owner.id, {
      displayName: "B",
      email: "b@example.com",
    });
    await expect(mergeCustomers(agent.id, a.id, b.id)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });
});
