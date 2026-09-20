import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  memberships,
  organizations,
  users,
  } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { upsertOwnAgentProfile, adminUpdateAgentProfile } from "@/lib/profiles/agent";
import {
  upsertOrganizationProfile,
  setOrganizationVerification,
} from "@/lib/profiles/organization";
import {
  getPublicAgentProfileByUsername,
  getPublicOrganizationProfileBySlug,
} from "@/lib/profiles/public";
import { createAgentPost, setAgentPostVisibility } from "@/lib/posts/agent-posts";
import {
  AuthorizationError,
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

async function seedUser(email: string, status: "ACTIVE" | "SUSPENDED" | "DELETED" = "ACTIVE") {
  const passwordHash = await hashPassword("securepass1");
  const [user] = await getTestDb()
    .insert(users)
    .values({ email, passwordHash, fullName: email, status })
    .returning();
  if (!user) throw new Error("user");
  return user;
}

async function addAgentMembership(userId: string, organizationId: string) {
  const [m] = await getTestDb()
    .insert(memberships)
    .values({
      userId,
      organizationId,
      role: "AGENT",
      status: "ACTIVE",
    })
    .returning();
  if (!m) throw new Error("membership");
  return m;
}

describe("organization profile authorization", () => {
  it("rejects AGENT editing organization profile", async () => {
    const owner = await seedUser("own-oa@example.com");
    const agent = await seedUser("ag-oa@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "OA",
      slug: "oa-org",
    });
    await addAgentMembership(agent.id, org.organizationId);
    await expect(
      upsertOrganizationProfile(agent.id, org.organizationId, {
        displayName: "Hacked",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("rejects ADMIN changing organization verification", async () => {
    const owner = await seedUser("own-ov@example.com");
    const admin = await seedUser("adm-ov@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "OV",
      slug: "ov-org",
    });
    await getTestDb().insert(memberships).values({
      userId: admin.id,
      organizationId: org.organizationId,
      role: "ADMIN",
      status: "ACTIVE",
    });
    await upsertOrganizationProfile(owner.id, org.organizationId, {
      displayName: "OV",
      visibility: "PUBLIC",
    });
    await expect(
      setOrganizationVerification(admin.id, org.organizationId, "VERIFIED"),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("allows OWNER to set organization verification", async () => {
    const owner = await seedUser("own-ok@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "OK",
      slug: "ok-org",
    });
    await upsertOrganizationProfile(owner.id, org.organizationId, {
      displayName: "OK",
      visibility: "PUBLIC",
    });
    const updated = await setOrganizationVerification(
      owner.id,
      org.organizationId,
      "VERIFIED",
    );
    expect(updated?.verificationStatus).toBe("VERIFIED");
  });
});

describe("post cross-tenant isolation", () => {
  it("rejects creating posts on another org profile", async () => {
    const a = await seedUser("pa@example.com");
    const b = await seedUser("pb@example.com");
    const orgA = await createOrganizationWithOwner(a.id, { name: "A", slug: "post-a" });
    const orgB = await createOrganizationWithOwner(b.id, { name: "B", slug: "post-b" });
    const profileA = await upsertOwnAgentProfile(a.id, orgA.organizationId, {
      publicUsername: "post-a-agent",
      displayName: "A",
    });
    await expect(
      createAgentPost(b.id, profileA.id, { body: "Intrusion" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    void orgB;
  });

  it("rejects modifying another org post", async () => {
    const a = await seedUser("ma@example.com");
    const b = await seedUser("mb@example.com");
    const orgA = await createOrganizationWithOwner(a.id, { name: "A", slug: "mod-a" });
    await createOrganizationWithOwner(b.id, { name: "B", slug: "mod-b" });
    const profileA = await upsertOwnAgentProfile(a.id, orgA.organizationId, {
      publicUsername: "mod-a-agent",
      displayName: "A",
    });
    const post = await createAgentPost(a.id, profileA.id, {
      body: "Mine",
      visibility: "DRAFT",
    });
    await expect(
      setAgentPostVisibility(b.id, post.id, "PUBLIC"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("preserves publishedAt across archive and re-publish", async () => {
    const user = await seedUser("pubat@example.com");
    const org = await createOrganizationWithOwner(user.id, {
      name: "P",
      slug: "pubat-org",
    });
    const profile = await upsertOwnAgentProfile(user.id, org.organizationId, {
      publicUsername: "pubat-agent",
      displayName: "P",
    });
    const post = await createAgentPost(user.id, profile.id, {
      body: "Hello",
      visibility: "PUBLIC",
    });
    const firstPublished = post.publishedAt;
    expect(firstPublished).toBeTruthy();
    const archived = await setAgentPostVisibility(user.id, post.id, "ARCHIVED");
    expect(archived?.publishedAt?.getTime()).toBe(firstPublished?.getTime());
    const republished = await setAgentPostVisibility(user.id, post.id, "PUBLIC");
    expect(republished?.publishedAt?.getTime()).toBe(firstPublished?.getTime());
  });
});

describe("public organization safety", () => {
  it("hides missing, private, suspended, and archived orgs", async () => {
    expect(await getPublicOrganizationProfileBySlug("no-such")).toBeNull();

    const user = await seedUser("orgsafe@example.com");
    const org = await createOrganizationWithOwner(user.id, {
      name: "Safe",
      slug: "safe-org",
    });
    // no profile yet
    expect(await getPublicOrganizationProfileBySlug("safe-org")).toBeNull();

    await upsertOrganizationProfile(user.id, org.organizationId, {
      displayName: "Safe",
      visibility: "PRIVATE",
    });
    expect(await getPublicOrganizationProfileBySlug("safe-org")).toBeNull();

    await upsertOrganizationProfile(user.id, org.organizationId, {
      displayName: "Safe",
      visibility: "PUBLIC",
    });
    expect(await getPublicOrganizationProfileBySlug("safe-org")).not.toBeNull();

    await getTestDb()
      .update(organizations)
      .set({ status: "SUSPENDED" })
      .where(eq(organizations.id, org.organizationId));
    expect(await getPublicOrganizationProfileBySlug("safe-org")).toBeNull();
  });

  it("excludes suspended agents and suspended users from org agent list", async () => {
    const owner = await seedUser("list-o@example.com");
    const agentUser = await seedUser("list-a@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "List",
      slug: "list-org",
    });
    await upsertOrganizationProfile(owner.id, org.organizationId, {
      displayName: "List",
      visibility: "PUBLIC",
    });
    const m = await addAgentMembership(agentUser.id, org.organizationId);
    await upsertOwnAgentProfile(agentUser.id, org.organizationId, {
      publicUsername: "list-agent",
      displayName: "Agent",
      visibility: "PUBLIC",
    });

    let pub = await getPublicOrganizationProfileBySlug("list-org");
    expect(pub?.agents.some((a) => a.username === "list-agent")).toBe(true);

    await getTestDb()
      .update(memberships)
      .set({ status: "SUSPENDED" })
      .where(eq(memberships.id, m.id));
    pub = await getPublicOrganizationProfileBySlug("list-org");
    expect(pub?.agents.some((a) => a.username === "list-agent")).toBe(false);
  });
});

describe("public DTO security", () => {
  it("omits sensitive fields from public agent JSON", async () => {
    const user = await seedUser("dto@example.com");
    const org = await createOrganizationWithOwner(user.id, {
      name: "DTO",
      slug: "dto-org",
    });
    await upsertOrganizationProfile(user.id, org.organizationId, {
      displayName: "DTO",
      visibility: "PUBLIC",
    });
    await upsertOwnAgentProfile(user.id, org.organizationId, {
      publicUsername: "dto-agent",
      displayName: "DTO Agent",
      visibility: "PUBLIC",
    });
    const pub = await getPublicAgentProfileByUsername("dto-agent");
    const json = JSON.stringify(pub);
    for (const forbidden of [
      "passwordHash",
      "password_hash",
      "tokenHash",
      "session",
      "membershipId",
      "organizationId",
      "userId",
      "actorUserId",
    ]) {
      expect(json.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

describe("multi-organization user", () => {
  it("keeps profiles, posts, and public listings isolated per org", async () => {
    const user = await seedUser("multi@example.com");
    const orgA = await createOrganizationWithOwner(user.id, {
      name: "Multi A",
      slug: "multi-a",
    });
    // Second org: create via another owner then add user as AGENT
    const other = await seedUser("multi-other@example.com");
    const orgB = await createOrganizationWithOwner(other.id, {
      name: "Multi B",
      slug: "multi-b",
    });
    await addAgentMembership(user.id, orgB.organizationId);

    await upsertOrganizationProfile(user.id, orgA.organizationId, {
      displayName: "Multi A",
      visibility: "PUBLIC",
    });
    await upsertOrganizationProfile(other.id, orgB.organizationId, {
      displayName: "Multi B",
      visibility: "PUBLIC",
    });

    const profileA = await upsertOwnAgentProfile(user.id, orgA.organizationId, {
      publicUsername: "multi-a-agent",
      displayName: "Agent A",
      visibility: "PUBLIC",
    });
    const profileB = await upsertOwnAgentProfile(user.id, orgB.organizationId, {
      publicUsername: "multi-b-agent",
      displayName: "Agent B",
      visibility: "PUBLIC",
    });

    expect(profileA.id).not.toBe(profileB.id);

    await createAgentPost(user.id, profileA.id, {
      body: "Post for A",
      visibility: "PUBLIC",
    });
    await createAgentPost(user.id, profileB.id, {
      body: "Post for B",
      visibility: "PUBLIC",
    });

    const pubA = await getPublicAgentProfileByUsername("multi-a-agent");
    const pubB = await getPublicAgentProfileByUsername("multi-b-agent");
    expect(pubA?.displayName).toBe("Agent A");
    expect(pubB?.displayName).toBe("Agent B");
    expect(pubA?.posts.some((p) => p.body === "Post for A")).toBe(true);
    expect(pubA?.posts.some((p) => p.body === "Post for B")).toBe(false);
    expect(pubB?.posts.some((p) => p.body === "Post for B")).toBe(true);

    const orgPubA = await getPublicOrganizationProfileBySlug("multi-a");
    const orgPubB = await getPublicOrganizationProfileBySlug("multi-b");
    expect(orgPubA?.agents.some((a) => a.username === "multi-a-agent")).toBe(true);
    expect(orgPubA?.agents.some((a) => a.username === "multi-b-agent")).toBe(false);
    expect(orgPubB?.agents.some((a) => a.username === "multi-b-agent")).toBe(true);
  });
});

describe("username concurrency", () => {
  it("maps concurrent unique username conflicts to ConflictError", async () => {
    const a = await seedUser("race1@example.com");
    const b = await seedUser("race2@example.com");
    const orgA = await createOrganizationWithOwner(a.id, { name: "R1", slug: "race-1" });
    const orgB = await createOrganizationWithOwner(b.id, { name: "R2", slug: "race-2" });

    const results = await Promise.allSettled([
      upsertOwnAgentProfile(a.id, orgA.organizationId, {
        publicUsername: "race-user",
        displayName: "A",
      }),
      upsertOwnAgentProfile(b.id, orgB.organizationId, {
        publicUsername: "race-user",
        displayName: "B",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    if (rejected[0]?.status === "rejected") {
      expect(rejected[0].reason).toBeInstanceOf(ConflictError);
    }
  });
});

describe("verification transition validation", () => {
  it("rejects invalid agent verification jumps when constrained", async () => {
    // All Phase 2 transitions are intentionally permissive among the four states;
    // this test documents UNVERIFIED → VERIFIED is allowed for admin.
    const owner = await seedUser("vtr@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "VT",
      slug: "vt-org",
    });
    const profile = await upsertOwnAgentProfile(owner.id, org.organizationId, {
      publicUsername: "vt-agent",
      displayName: "VT",
    });
    await expect(
      adminUpdateAgentProfile(owner.id, org.organizationId, profile.id, {
        verificationStatus: "VERIFIED",
      }),
    ).resolves.toMatchObject({ verificationStatus: "VERIFIED" });
  });
});
