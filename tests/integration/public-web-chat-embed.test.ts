import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { upsertOrganizationProfile } from "@/lib/profiles/organization";
import {
  createInstallation,
  updateInstallation,
} from "@/lib/web-chat/installations";
import { getPublicWebChatEmbedByOrgSlug } from "@/lib/web-chat/public-embed";
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

describe("public web chat embed", () => {
  it("returns embed only when public profile + ACTIVE installation", async () => {
    const owner = await seedUser("embed@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "Ola Autos",
      slug: "ola-autos",
    });

    // No profile + no install
    expect(await getPublicWebChatEmbedByOrgSlug("ola-autos")).toBeNull();

    await upsertOrganizationProfile(owner.id, org.organizationId, {
      displayName: "Ola Autos",
      description: "Cars",
      visibility: "PUBLIC",
    });

    // Public profile but no web chat
    expect(await getPublicWebChatEmbedByOrgSlug("ola-autos")).toBeNull();

    const installation = await createInstallation(owner.id, org.organizationId, {
      name: "Site chat",
      config: {
        displayName: "Ola Support",
        welcomeMessage: "How can we help?",
      },
    });

    const embed = await getPublicWebChatEmbedByOrgSlug("ola-autos");
    expect(embed).not.toBeNull();
    expect(embed!.publicKey).toBe(installation.publicKey);
    expect(embed!.displayName).toBe("Ola Support");
    expect(embed!.welcomeMessage).toBe("How can we help?");
    // No internal IDs leaked
    expect(JSON.stringify(embed)).not.toMatch(/organizationId/);
  });

  it("hides embed when installation is DISABLED", async () => {
    const owner = await seedUser("embed2@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "Shop",
      slug: "shop-co",
    });
    await upsertOrganizationProfile(owner.id, org.organizationId, {
      displayName: "Shop",
      visibility: "PUBLIC",
    });
    const installation = await createInstallation(owner.id, org.organizationId, {
      name: "Main",
    });
    await updateInstallation(owner.id, installation.id, { status: "DISABLED" });

    expect(await getPublicWebChatEmbedByOrgSlug("shop-co")).toBeNull();
  });

  it("hides embed when profile is PRIVATE", async () => {
    const owner = await seedUser("embed3@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "Private Co",
      slug: "private-co",
    });
    await upsertOrganizationProfile(owner.id, org.organizationId, {
      displayName: "Private Co",
      visibility: "PRIVATE",
    });
    await createInstallation(owner.id, org.organizationId, { name: "Main" });

    expect(await getPublicWebChatEmbedByOrgSlug("private-co")).toBeNull();
  });

  it("does not cross orgs by slug", async () => {
    const a = await seedUser("a-embed@example.com");
    const b = await seedUser("b-embed@example.com");
    const orgA = await createOrganizationWithOwner(a.id, {
      name: "A",
      slug: "org-a-embed",
    });
    await createOrganizationWithOwner(b.id, {
      name: "B",
      slug: "org-b-embed",
    });
    await upsertOrganizationProfile(a.id, orgA.organizationId, {
      displayName: "A",
      visibility: "PUBLIC",
    });
    const instA = await createInstallation(a.id, orgA.organizationId, {
      name: "A chat",
    });

    const embedA = await getPublicWebChatEmbedByOrgSlug("org-a-embed");
    expect(embedA?.publicKey).toBe(instA.publicKey);
    expect(await getPublicWebChatEmbedByOrgSlug("org-b-embed")).toBeNull();
    expect(await getPublicWebChatEmbedByOrgSlug("missing-slug")).toBeNull();
  });
});
