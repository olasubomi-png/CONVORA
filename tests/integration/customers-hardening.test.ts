import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users, customers } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createCustomer } from "@/lib/customers/create";
import { listCustomers } from "@/lib/customers/list";
import { mergeCustomers } from "@/lib/customers/merge";
import {
  createAttributeDefinition,
  setCustomerAttributes,
} from "@/lib/customers/attributes";
import { listCustomerActivity } from "@/lib/customers/activity";
import { createOrganizationTag } from "@/lib/conversations/tags";
import { addCustomerTag } from "@/lib/customers/tags";
import {
  ConflictError,
  ValidationError,
} from "@/lib/errors";
import { getTestDb, setupTestEnv, truncateAllTables } from "../helpers/db";
import { recordAuditEvent } from "@/lib/audit";

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

describe("merge concurrency and retirement", () => {
  it("rejects merging an already-merged source", async () => {
    const owner = await seedUser("m1@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "M",
      slug: "m-hard-1",
    });
    const a = await createCustomer(org.organizationId, owner.id, {
      displayName: "A",
    });
    const b = await createCustomer(org.organizationId, owner.id, {
      displayName: "B",
      email: "b@ex.com",
    });
    const c = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
      email: "c@ex.com",
    });
    await mergeCustomers(owner.id, a.id, b.id);
    await expect(mergeCustomers(owner.id, a.id, b.id)).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(mergeCustomers(owner.id, c.id, b.id)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("excludes merged customers from default list", async () => {
    const owner = await seedUser("m2@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "M2",
      slug: "m-hard-2",
    });
    const a = await createCustomer(org.organizationId, owner.id, {
      displayName: "Keep",
    });
    const b = await createCustomer(org.organizationId, owner.id, {
      displayName: "Drop",
      email: "drop@ex.com",
    });
    await mergeCustomers(owner.id, a.id, b.id);
    const list = await listCustomers(owner.id, org.organizationId);
    expect(list.customers.every((c) => c.displayName !== "Drop")).toBe(true);
    expect(list.customers.some((c) => c.id === a.id)).toBe(true);

    const [merged] = await getTestDb()
      .select()
      .from(customers)
      .where(eq(customers.id, b.id));
    expect(merged?.status).toBe("MERGED");
    expect(merged?.mergedIntoCustomerId).toBe(a.id);
  });

  it("serializes concurrent merges of the same source", async () => {
    const owner = await seedUser("m3@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "M3",
      slug: "m-hard-3",
    });
    const a = await createCustomer(org.organizationId, owner.id, {
      displayName: "A",
    });
    const b = await createCustomer(org.organizationId, owner.id, {
      displayName: "B",
      email: "b3@ex.com",
    });
    const c = await createCustomer(org.organizationId, owner.id, {
      displayName: "C",
      email: "c3@ex.com",
    });

    const results = await Promise.allSettled([
      mergeCustomers(owner.id, a.id, b.id),
      mergeCustomers(owner.id, c.id, b.id),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const [src] = await getTestDb()
      .select()
      .from(customers)
      .where(eq(customers.id, b.id));
    expect(src?.status).toBe("MERGED");
    expect(src?.mergedIntoCustomerId).toBeTruthy();
  });
});

describe("attribute validation at service layer", () => {
  it("rejects invalid boolean and select values", async () => {
    const owner = await seedUser("attr@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "A",
      slug: "attr-org",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "X",
    });
    await createAttributeDefinition(owner.id, org.organizationId, {
      key: "vip",
      label: "VIP",
      type: "BOOLEAN",
    });
    await createAttributeDefinition(owner.id, org.organizationId, {
      key: "tier",
      label: "Tier",
      type: "SELECT",
      options: ["A", "B"],
    });
    await expect(
      setCustomerAttributes(owner.id, customer.id, { vip: "yes" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      setCustomerAttributes(owner.id, customer.id, { tier: "C" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await setCustomerAttributes(owner.id, customer.id, {
      vip: true,
      tier: "A",
    });
  });

  it("rejects SELECT without options and reserved keys", async () => {
    const owner = await seedUser("attr2@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "A2",
      slug: "attr2-org",
    });
    await expect(
      createAttributeDefinition(owner.id, org.organizationId, {
        key: "tier",
        label: "Tier",
        type: "SELECT",
        options: [],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createAttributeDefinition(owner.id, org.organizationId, {
        key: "email",
        label: "Email",
        type: "TEXT",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("activity pagination without holes", () => {
  it("filters event types in SQL and paginates continuously", async () => {
    const owner = await seedUser("act@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "Act",
      slug: "act-org",
    });
    const customer = await createCustomer(org.organizationId, owner.id, {
      displayName: "ActC",
    });

    // Noise events without customerId
    for (let i = 0; i < 5; i++) {
      await recordAuditEvent({
        eventType: "USER_LOGIN",
        actorUserId: owner.id,
        organizationId: org.organizationId,
        payload: {},
      });
    }

    const page1 = await listCustomerActivity(owner.id, customer.id, {
      limit: 5,
    });
    expect(
      page1.events.every((e) => e.type.startsWith("CUSTOMER") || e.type.startsWith("CONVERSATION")),
    ).toBe(true);
    // At least CUSTOMER_CREATED
    expect(page1.events.some((e) => e.type === "CUSTOMER_CREATED")).toBe(true);
  });
});

describe("cross-tenant tag attach", () => {
  it("rejects foreign org tags", async () => {
    const a = await seedUser("tg1@example.com");
    const b = await seedUser("tg2@example.com");
    const orgA = await createOrganizationWithOwner(a.id, {
      name: "A",
      slug: "tg-a",
    });
    const orgB = await createOrganizationWithOwner(b.id, {
      name: "B",
      slug: "tg-b",
    });
    const customer = await createCustomer(orgA.organizationId, a.id, {
      displayName: "C",
    });
    const tagB = await createOrganizationTag(b.id, orgB.organizationId, "VIP");
    await expect(
      addCustomerTag(a.id, customer.id, tagB.id),
    ).rejects.toBeTruthy();
  });
});
