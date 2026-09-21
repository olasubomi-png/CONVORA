import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users, sessions, memberships } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { loginUser } from "@/lib/auth/login";
import { createSessionRecord, getSessionByToken } from "@/lib/auth/session";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { requirePermission } from "@/lib/authz/permissions";
import { AuthorizationError } from "@/lib/errors";
import { getTestDb, setupTestEnv, truncateAllTables } from "../helpers/db";

beforeAll(() => {
  setupTestEnv();
});

beforeEach(async () => {
  await truncateAllTables();
});

async function seedUser(email: string, password = "securepass1") {
  const passwordHash = await hashPassword(password);
  const [user] = await getTestDb()
    .insert(users)
    .values({ email, passwordHash, fullName: email })
    .returning();
  if (!user) throw new Error("user");
  return user;
}

describe("session rotation on login", () => {
  it("revokes prior sessions when user logs in again", async () => {
    const user = await seedUser("sec-rot@example.com");
    const first = await createSessionRecord(user.id);
    const stillValid = await getSessionByToken(first.token);
    expect(stillValid).not.toBeNull();

    await loginUser(
      { email: "sec-rot@example.com", password: "securepass1" },
      { setCookie: false },
    );

    const after = await getSessionByToken(first.token);
    expect(after).toBeNull();

    const active = await getTestDb()
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    const live = active.filter((s) => s.revokedAt === null);
    expect(live.length).toBe(1);
  });
});

describe("permission enforcement", () => {
  it("AGENT cannot export analytics capability", async () => {
    const owner = await seedUser("sec-own@example.com");
    const agent = await seedUser("sec-ag@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "SEC",
      slug: "sec-1",
    });
    await getTestDb().insert(memberships).values({
      organizationId: org.organizationId,
      userId: agent.id,
      role: "AGENT",
      status: "ACTIVE",
    });

    await expect(
      requirePermission(agent.id, org.organizationId, "analytics.export"),
    ).rejects.toBeInstanceOf(AuthorizationError);

    await expect(
      requirePermission(agent.id, org.organizationId, "channels.manage"),
    ).rejects.toBeInstanceOf(AuthorizationError);

    // view is allowed
    await expect(
      requirePermission(agent.id, org.organizationId, "analytics.view"),
    ).resolves.toBeTruthy();
  });

  it("revoked membership cannot use permissions", async () => {
    const owner = await seedUser("sec-rv@example.com");
    const agent = await seedUser("sec-rva@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "SECR",
      slug: "sec-r",
    });
    const [mem] = await getTestDb()
      .insert(memberships)
      .values({
        organizationId: org.organizationId,
        userId: agent.id,
        role: "AGENT",
        status: "ACTIVE",
      })
      .returning();
    await getTestDb()
      .update(memberships)
      .set({ status: "REMOVED" })
      .where(eq(memberships.id, mem!.id));

    await expect(
      requirePermission(agent.id, org.organizationId, "conversations.view"),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("cross-org permission check fails", async () => {
    const a = await seedUser("sec-xa@example.com");
    const b = await seedUser("sec-xb@example.com");
    await createOrganizationWithOwner(a.id, { name: "A", slug: "sec-xa" });
    const orgB = await createOrganizationWithOwner(b.id, {
      name: "B",
      slug: "sec-xb",
    });
    await expect(
      requirePermission(a.id, orgB.organizationId, "org.view"),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
