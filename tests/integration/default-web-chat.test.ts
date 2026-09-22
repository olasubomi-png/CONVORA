import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { users, webChatInstallations } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import {
  ensureDefaultWebChatInstallation,
  listInstallations,
} from "@/lib/web-chat/installations";
import { getPublicWebChatEmbedByOrgSlug } from "@/lib/web-chat/public-embed";
import { upsertOrganizationProfile } from "@/lib/profiles/organization";
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

describe("default Web Chat provisioning", () => {
  it("creates exactly one default Web Chat when an organization is created", async () => {
    const owner = await seedUser("def-wc1@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "Acme Support",
      slug: "acme-support",
    });

    const rows = await getTestDb()
      .select()
      .from(webChatInstallations)
      .where(eq(webChatInstallations.organizationId, org.organizationId));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.isDefault).toBe(true);
    expect(rows[0]?.status).toBe("ACTIVE");
    expect(rows[0]?.publicKey).toMatch(/^wc_/);
  });

  it("is idempotent under repeated ensureDefault calls", async () => {
    const owner = await seedUser("def-wc2@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "Twice Org",
      slug: "twice-org",
    });

    const a = await ensureDefaultWebChatInstallation(org.organizationId, {
      displayName: "Twice Org",
      actorUserId: owner.id,
    });
    const b = await ensureDefaultWebChatInstallation(org.organizationId, {
      displayName: "Twice Org",
      actorUserId: owner.id,
    });

    expect(a.id).toBe(b.id);

    const rows = await getTestDb()
      .select()
      .from(webChatInstallations)
      .where(
        and(
          eq(webChatInstallations.organizationId, org.organizationId),
          eq(webChatInstallations.isDefault, true),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it("exposes public embed after profile is public", async () => {
    const owner = await seedUser("def-wc3@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "Public Chat Co",
      slug: "public-chat-co",
    });
    await upsertOrganizationProfile(owner.id, org.organizationId, {
      displayName: "Public Chat Co",
      description: "We reply here",
      visibility: "PUBLIC",
    });

    const embed = await getPublicWebChatEmbedByOrgSlug("public-chat-co");
    expect(embed).not.toBeNull();
    expect(embed?.publicKey).toMatch(/^wc_/);
  });

  it("does not leak installations across organizations", async () => {
    const a = await seedUser("def-wc-a@example.com");
    const b = await seedUser("def-wc-b@example.com");
    const orgA = await createOrganizationWithOwner(a.id, {
      name: "Org A",
      slug: "org-a-wc",
    });
    const orgB = await createOrganizationWithOwner(b.id, {
      name: "Org B",
      slug: "org-b-wc",
    });

    const listA = await listInstallations(a.id, orgA.organizationId);
    const listB = await listInstallations(b.id, orgB.organizationId);
    expect(listA).toHaveLength(1);
    expect(listB).toHaveLength(1);
    expect(listA[0]?.organizationId).toBe(orgA.organizationId);
    expect(listB[0]?.organizationId).toBe(orgB.organizationId);
    expect(listA[0]?.publicKey).not.toBe(listB[0]?.publicKey);

    await expect(listInstallations(a.id, orgB.organizationId)).rejects.toThrow();
  });
});
