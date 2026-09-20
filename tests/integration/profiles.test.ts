import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  memberships,
  organizations,
  users,
  auditEvents,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { upsertOwnAgentProfile, adminUpdateAgentProfile } from "@/lib/profiles/agent";
import { upsertOrganizationProfile } from "@/lib/profiles/organization";
import {
  getPublicAgentProfileByUsername,
  getPublicOrganizationProfileBySlug,
} from "@/lib/profiles/public";
import { createAgentPost, setAgentPostVisibility } from "@/lib/posts/agent-posts";
import {
  NotFoundError,
  ConflictError,
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

describe("agent profiles", () => {
  it("creates profile bound to membership with unique username", async () => {
    const user = await seedUser("agent@example.com");
    const org = await createOrganizationWithOwner(user.id, {
      name: "Acme",
      slug: "acme-prof",
    });
    const profile = await upsertOwnAgentProfile(user.id, org.organizationId, {
      publicUsername: "David Adebayo",
      displayName: "David Adebayo",
      professionalTitle: "Sales Agent",
      visibility: "PUBLIC",
    });
    expect(profile.publicUsername).toBe("david-adebayo");
    expect(profile.membershipId).toBe(org.membershipId);
  });

  it("rejects duplicate usernames", async () => {
    const a = await seedUser("a1@example.com");
    const b = await seedUser("b1@example.com");
    const orgA = await createOrganizationWithOwner(a.id, { name: "A", slug: "org-pa" });
    const orgB = await createOrganizationWithOwner(b.id, { name: "B", slug: "org-pb" });
    await upsertOwnAgentProfile(a.id, orgA.organizationId, {
      publicUsername: "shared-name",
      displayName: "A",
      visibility: "PUBLIC",
    });
    await expect(
      upsertOwnAgentProfile(b.id, orgB.organizationId, {
        publicUsername: "shared-name",
        displayName: "B",
        visibility: "PUBLIC",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects cross-tenant profile updates", async () => {
    const a = await seedUser("xa@example.com");
    const b = await seedUser("xb@example.com");
    const orgA = await createOrganizationWithOwner(a.id, { name: "A", slug: "x-a" });
    const orgB = await createOrganizationWithOwner(b.id, { name: "B", slug: "x-b" });
    const profile = await upsertOwnAgentProfile(a.id, orgA.organizationId, {
      publicUsername: "agent-a",
      displayName: "A",
    });
    // Cross-tenant: do not leak profile existence — NotFound, not Authorization.
    await expect(
      adminUpdateAgentProfile(b.id, orgB.organizationId, profile.id, {
        displayName: "Hacked",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("public visibility", () => {
  it("returns public active profiles and hides private ones", async () => {
    const user = await seedUser("pub@example.com");
    const org = await createOrganizationWithOwner(user.id, {
      name: "Pub Org",
      slug: "pub-org",
    });
    await upsertOrganizationProfile(user.id, org.organizationId, {
      displayName: "Pub Org",
      visibility: "PUBLIC",
    });
    await upsertOwnAgentProfile(user.id, org.organizationId, {
      publicUsername: "public-agent",
      displayName: "Public Agent",
      visibility: "PUBLIC",
    });
    const found = await getPublicAgentProfileByUsername("public-agent");
    expect(found?.displayName).toBe("Public Agent");
    expect(found).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(found)).not.toMatch(/membership/i);

    await upsertOwnAgentProfile(user.id, org.organizationId, {
      publicUsername: "public-agent",
      displayName: "Public Agent",
      visibility: "PRIVATE",
    });
    expect(await getPublicAgentProfileByUsername("public-agent")).toBeNull();
  });

  it("hides profiles for suspended memberships", async () => {
    const user = await seedUser("susp@example.com");
    const org = await createOrganizationWithOwner(user.id, {
      name: "S",
      slug: "susp-org",
    });
    await upsertOwnAgentProfile(user.id, org.organizationId, {
      publicUsername: "susp-agent",
      displayName: "S",
      visibility: "PUBLIC",
    });
    await getTestDb()
      .update(memberships)
      .set({ status: "SUSPENDED" })
      .where(eq(memberships.id, org.membershipId));
    expect(await getPublicAgentProfileByUsername("susp-agent")).toBeNull();
  });

  it("hides profiles when organization is suspended", async () => {
    const user = await seedUser("orgsus@example.com");
    const org = await createOrganizationWithOwner(user.id, {
      name: "OS",
      slug: "orgsus",
    });
    await upsertOwnAgentProfile(user.id, org.organizationId, {
      publicUsername: "orgsus-agent",
      displayName: "OS",
      visibility: "PUBLIC",
    });
    await getTestDb()
      .update(organizations)
      .set({ status: "SUSPENDED" })
      .where(eq(organizations.id, org.organizationId));
    expect(await getPublicAgentProfileByUsername("orgsus-agent")).toBeNull();
  });

  it("hides suspended verification on agent profiles", async () => {
    const user = await seedUser("verif@example.com");
    const org = await createOrganizationWithOwner(user.id, {
      name: "V",
      slug: "verif-org",
    });
    const profile = await upsertOwnAgentProfile(user.id, org.organizationId, {
      publicUsername: "verif-agent",
      displayName: "V",
      visibility: "PUBLIC",
    });
    await adminUpdateAgentProfile(user.id, org.organizationId, profile.id, {
      verificationStatus: "SUSPENDED",
    });
    expect(await getPublicAgentProfileByUsername("verif-agent")).toBeNull();
  });
});

describe("organization profiles", () => {
  it("creates public org profile with agents", async () => {
    const user = await seedUser("orgp@example.com");
    const org = await createOrganizationWithOwner(user.id, {
      name: "ABC",
      slug: "abc-props",
    });
    await upsertOrganizationProfile(user.id, org.organizationId, {
      displayName: "ABC Properties",
      description: "Property services",
      visibility: "PUBLIC",
    });
    await upsertOwnAgentProfile(user.id, org.organizationId, {
      publicUsername: "abc-agent",
      displayName: "Agent",
      visibility: "PUBLIC",
    });
    const pub = await getPublicOrganizationProfileBySlug("abc-props");
    expect(pub?.displayName).toBe("ABC Properties");
    expect(pub?.agents.some((a) => a.username === "abc-agent")).toBe(true);
  });
});

describe("posts and verification audit", () => {
  it("publishes posts only when public", async () => {
    const user = await seedUser("post@example.com");
    const org = await createOrganizationWithOwner(user.id, {
      name: "P",
      slug: "post-org",
    });
    await upsertOrganizationProfile(user.id, org.organizationId, {
      displayName: "P",
      visibility: "PUBLIC",
    });
    const profile = await upsertOwnAgentProfile(user.id, org.organizationId, {
      publicUsername: "post-agent",
      displayName: "P",
      visibility: "PUBLIC",
    });
    const draft = await createAgentPost(user.id, profile.id, {
      body: "Draft only",
      visibility: "DRAFT",
    });
    let pub = await getPublicAgentProfileByUsername("post-agent");
    expect(pub?.posts.length).toBe(0);
    await setAgentPostVisibility(user.id, draft.id, "PUBLIC");
    pub = await getPublicAgentProfileByUsername("post-agent");
    expect(pub?.posts.length).toBe(1);
  });

  it("records verification audit without secrets", async () => {
    const user = await seedUser("vaudit@example.com");
    const org = await createOrganizationWithOwner(user.id, {
      name: "VA",
      slug: "vaudit",
    });
    const profile = await upsertOwnAgentProfile(user.id, org.organizationId, {
      publicUsername: "vaudit-agent",
      displayName: "VA",
    });
    await adminUpdateAgentProfile(user.id, org.organizationId, profile.id, {
      verificationStatus: "VERIFIED",
    });
    const events = await getTestDb()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "AGENT_VERIFIED"));
    expect(events.length).toBe(1);
    expect(JSON.stringify(events[0]?.payload)).not.toMatch(/password/i);
  });
});
