import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  users,
  customers,
  customerTagLinks,
  auditEvents,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createCustomer } from "@/lib/customers/create";
import { listCustomers } from "@/lib/customers/list";
import { mergeCustomers } from "@/lib/customers/merge";
import { createOrganizationTag } from "@/lib/conversations/tags";
import { addCustomerTag } from "@/lib/customers/tags";
import {
  ConflictError,
  NotFoundError,
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

describe("email normalization", () => {
  it("treats case variants as the same active identity", async () => {
    const owner = await seedUser("em@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "E",
      slug: "email-norm",
    });
    await createCustomer(org.organizationId, owner.id, {
      displayName: "A",
      email: " Test@Example.com ",
    });
    await expect(
      createCustomer(org.organizationId, owner.id, {
        displayName: "B",
        email: "test@example.com",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("cross-tenant composite integrity", () => {
  it("rejects attaching foreign-org tag at service layer", async () => {
    const a = await seedUser("f1@example.com");
    const b = await seedUser("f2@example.com");
    const orgA = await createOrganizationWithOwner(a.id, {
      name: "A",
      slug: "fin-a",
    });
    const orgB = await createOrganizationWithOwner(b.id, {
      name: "B",
      slug: "fin-b",
    });
    const customer = await createCustomer(orgA.organizationId, a.id, {
      displayName: "C",
    });
    const tagB = await createOrganizationTag(b.id, orgB.organizationId, "X");
    await expect(
      addCustomerTag(a.id, customer.id, tagB.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects DB insert that crosses org for tags", async () => {
    const a = await seedUser("dbt@example.com");
    const b = await seedUser("dbt2@example.com");
    const orgA = await createOrganizationWithOwner(a.id, {
      name: "A",
      slug: "dbt-a",
    });
    const orgB = await createOrganizationWithOwner(b.id, {
      name: "B",
      slug: "dbt-b",
    });
    const customer = await createCustomer(orgA.organizationId, a.id, {
      displayName: "C",
    });
    const tagB = await createOrganizationTag(b.id, orgB.organizationId, "Y");
    await expect(
      getTestDb()
        .insert(customerTagLinks)
        .values({
          customerId: customer.id,
          tagId: tagB.id,
          organizationId: orgA.organizationId,
        }),
    ).rejects.toBeTruthy();
  });
});

describe("concurrent opposing merges", () => {
  it("allows only one direction under concurrent A↔B merges", async () => {
    const owner = await seedUser("opp@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "O",
      slug: "opp-merge",
    });
    const a = await createCustomer(org.organizationId, owner.id, {
      displayName: "A",
    });
    const b = await createCustomer(org.organizationId, owner.id, {
      displayName: "B",
      email: "b@ex.com",
    });

    const results = await Promise.allSettled([
      mergeCustomers(owner.id, a.id, b.id),
      mergeCustomers(owner.id, b.id, a.id),
    ]);

    const ok = results.filter((r) => r.status === "fulfilled");
    const fail = results.filter((r) => r.status === "rejected");
    expect(ok.length).toBe(1);
    expect(fail.length).toBe(1);

    const rows = await getTestDb().select().from(customers);
    const active = rows.filter((r) => r.status === "ACTIVE");
    const merged = rows.filter((r) => r.status === "MERGED");
    expect(active).toHaveLength(1);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.mergedIntoCustomerId).toBe(active[0]?.id);

    const audits = await getTestDb()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "CUSTOMER_MERGED"));
    expect(audits).toHaveLength(1);
  });
});

describe("search isolation", () => {
  it("does not return other org customers named David", async () => {
    const a = await seedUser("s1@example.com");
    const b = await seedUser("s2@example.com");
    const orgA = await createOrganizationWithOwner(a.id, {
      name: "A",
      slug: "srch-a",
    });
    const orgB = await createOrganizationWithOwner(b.id, {
      name: "B",
      slug: "srch-b",
    });
    await createCustomer(orgA.organizationId, a.id, { displayName: "David" });
    await createCustomer(orgB.organizationId, b.id, { displayName: "David" });
    const r = await listCustomers(a.id, orgA.organizationId, { q: "David" });
    expect(r.customers).toHaveLength(1);
  });
});
