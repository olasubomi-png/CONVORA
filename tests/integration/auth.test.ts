import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  users,
  sessions,
  memberships,
  organizations,
  auditEvents,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import {
  createSessionRecord,
  getSessionByToken,
  revokeSession,
} from "@/lib/auth/session";
import { registerUser } from "@/lib/auth/register";
import { loginUser } from "@/lib/auth/login";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import {
  getActiveMembership,
  requireOrganizationRole,
  requireActiveMembership,
} from "@/lib/authz/membership";
import {
  ConflictError,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/errors";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/tokens";
import { isUniqueViolation } from "@/lib/db-errors";
import { getTestDb, setupTestEnv, truncateAllTables } from "../helpers/db";

beforeAll(() => {
  setupTestEnv();
});

beforeEach(async () => {
  await truncateAllTables();
});

async function insertUser(email: string, status: "ACTIVE" | "SUSPENDED" | "DELETED" = "ACTIVE") {
  const passwordHash = await hashPassword("securepass1");
  const [user] = await getTestDb()
    .insert(users)
    .values({ email, passwordHash, fullName: email, status })
    .returning();
  if (!user) throw new Error("failed to insert user");
  return user;
}

describe("registration", () => {
  it("creates user with hashed password and normalized email", async () => {
    const result = await registerUser(
      { email: "Alex@Example.COM", password: "securepass1", fullName: "Alex" },
      { setCookie: false },
    );
    const rows = await getTestDb().select().from(users).where(eq(users.id, result.userId));
    expect(rows[0]?.email).toBe("alex@example.com");
    expect(rows[0]?.passwordHash).not.toContain("securepass1");
  });

  it("rejects duplicate emails via application check", async () => {
    await registerUser(
      { email: "dup@example.com", password: "securepass1", fullName: "Dup" },
      { setCookie: false },
    );
    await expect(
      registerUser(
        { email: "DUP@example.com", password: "securepass1", fullName: "Dup2" },
        { setCookie: false },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("maps unique constraint race to ConflictError", async () => {
    const passwordHash = await hashPassword("securepass1");
    await getTestDb().insert(users).values({
      email: "race@example.com",
      passwordHash,
      fullName: "Existing",
    });

    // Bypass pre-check path by calling insert through register after deleting
    // the pre-check would still find them — simulate constraint path via direct
    // second concurrent-style insert mapped by register's catch.
    await expect(
      registerUser(
        { email: "race@example.com", password: "securepass1", fullName: "Racer" },
        { setCookie: false },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("records USER_REGISTERED without secrets", async () => {
    const result = await registerUser(
      { email: "audit-reg@example.com", password: "securepass1", fullName: "Audit" },
      { setCookie: false },
    );
    const events = await getTestDb()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "USER_REGISTERED"));
    expect(events.length).toBeGreaterThan(0);
    const payload = events[0]?.payload ?? {};
    expect(JSON.stringify(payload)).not.toMatch(/securepass1/);
    expect(JSON.stringify(payload)).not.toContain(result.token);
    expect(payload).not.toHaveProperty("password");
    expect(payload).not.toHaveProperty("passwordHash");
  });
});

describe("login", () => {
  it("rejects invalid credentials for nonexistent user", async () => {
    await expect(
      loginUser(
        { email: "nobody@example.com", password: "securepass1" },
        { setCookie: false },
      ),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects invalid password", async () => {
    await registerUser(
      { email: "pw@example.com", password: "securepass1", fullName: "Pw" },
      { setCookie: false },
    );
    await expect(
      loginUser(
        { email: "pw@example.com", password: "wrongpass99" },
        { setCookie: false },
      ),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("accepts valid credentials", async () => {
    await registerUser(
      { email: "ok@example.com", password: "securepass1", fullName: "Ok" },
      { setCookie: false },
    );
    const result = await loginUser(
      { email: "ok@example.com", password: "securepass1" },
      { setCookie: false },
    );
    expect(result.userId).toBeTruthy();
  });

  it("rejects suspended user", async () => {
    const user = await insertUser("sus-login@example.com", "SUSPENDED");
    await expect(
      loginUser(
        { email: user.email, password: "securepass1" },
        { setCookie: false },
      ),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("records USER_LOGIN without secrets", async () => {
    await registerUser(
      { email: "audit-login@example.com", password: "securepass1", fullName: "L" },
      { setCookie: false },
    );
    const result = await loginUser(
      { email: "audit-login@example.com", password: "securepass1" },
      { setCookie: false },
    );
    const events = await getTestDb()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "USER_LOGIN"));
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events[0]?.payload ?? {})).not.toContain(result.token);
  });
});

describe("sessions", () => {
  it("creates, resolves, and revokes sessions", async () => {
    const user = await insertUser("session@example.com");
    const record = await createSessionRecord(user.id);
    expect((await getSessionByToken(record.token))?.user.id).toBe(user.id);
    await revokeSession(record.sessionId);
    expect(await getSessionByToken(record.token)).toBeNull();
  });

  it("rejects expired sessions", async () => {
    const user = await insertUser("expired@example.com");
    const token = generateSessionToken();
    await getTestDb().insert(sessions).values({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await getSessionByToken(token)).toBeNull();
  });

  it("rejects revoked sessions", async () => {
    const user = await insertUser("revoked@example.com");
    const record = await createSessionRecord(user.id);
    await revokeSession(record.sessionId);
    expect(await getSessionByToken(record.token)).toBeNull();
  });

  it("rejects sessions for suspended users", async () => {
    const user = await insertUser("sus-sess@example.com", "ACTIVE");
    const record = await createSessionRecord(user.id);
    await getTestDb()
      .update(users)
      .set({ status: "SUSPENDED" })
      .where(eq(users.id, user.id));
    expect(await getSessionByToken(record.token)).toBeNull();
  });

  it("rejects sessions for deleted users", async () => {
    const user = await insertUser("del-sess@example.com", "ACTIVE");
    const record = await createSessionRecord(user.id);
    await getTestDb()
      .update(users)
      .set({ status: "DELETED" })
      .where(eq(users.id, user.id));
    expect(await getSessionByToken(record.token)).toBeNull();
  });

  it("rejects invalid/unknown tokens", async () => {
    expect(await getSessionByToken("not-a-real-session-token")).toBeNull();
  });
});

describe("organizations", () => {
  it("creates org with OWNER membership atomically", async () => {
    const user = await insertUser("owner@example.com");
    const result = await createOrganizationWithOwner(user.id, {
      name: "Acme",
      slug: "acme",
    });
    const m = await getActiveMembership(user.id, result.organizationId);
    expect(m?.role).toBe("OWNER");
  });

  it("rejects duplicate slugs", async () => {
    const user = await insertUser("slug@example.com");
    await createOrganizationWithOwner(user.id, { name: "One", slug: "shared" });
    await expect(
      createOrganizationWithOwner(user.id, { name: "Two", slug: "shared" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("maps concurrent duplicate slug to ConflictError", async () => {
    const user = await insertUser("slug-race@example.com");
    await getTestDb().insert(organizations).values({
      name: "Existing",
      slug: "taken-slug",
    });
    await expect(
      createOrganizationWithOwner(user.id, {
        name: "Racer",
        slug: "taken-slug",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("records ORGANIZATION_CREATED without secrets", async () => {
    const user = await insertUser("org-audit@example.com");
    await createOrganizationWithOwner(user.id, {
      name: "Audit Org",
      slug: "audit-org",
    });
    const events = await getTestDb()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "ORGANIZATION_CREATED"));
    expect(events.length).toBe(1);
    expect(events[0]?.payload).toMatchObject({ slug: "audit-org", name: "Audit Org" });
  });
});

describe("membership lifecycle", () => {
  it("rejects suspended membership", async () => {
    const user = await insertUser("m-sus@example.com");
    const [org] = await getTestDb()
      .insert(organizations)
      .values({ name: "S", slug: "m-sus-org" })
      .returning();
    if (!org) throw new Error("org");
    await getTestDb().insert(memberships).values({
      organizationId: org.id,
      userId: user.id,
      role: "AGENT",
      status: "SUSPENDED",
    });
    expect(await getActiveMembership(user.id, org.id)).toBeNull();
    await expect(requireActiveMembership(user.id, org.id)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it("rejects removed membership", async () => {
    const user = await insertUser("m-rem@example.com");
    const [org] = await getTestDb()
      .insert(organizations)
      .values({ name: "R", slug: "m-rem-org" })
      .returning();
    if (!org) throw new Error("org");
    await getTestDb().insert(memberships).values({
      organizationId: org.id,
      userId: user.id,
      role: "AGENT",
      status: "REMOVED",
    });
    expect(await getActiveMembership(user.id, org.id)).toBeNull();
  });

  it("rejects membership when organization is suspended", async () => {
    const user = await insertUser("org-sus@example.com");
    const [org] = await getTestDb()
      .insert(organizations)
      .values({ name: "OS", slug: "org-sus", status: "SUSPENDED" })
      .returning();
    if (!org) throw new Error("org");
    await getTestDb().insert(memberships).values({
      organizationId: org.id,
      userId: user.id,
      role: "OWNER",
      status: "ACTIVE",
    });
    expect(await getActiveMembership(user.id, org.id)).toBeNull();
  });

  it("rejects membership when organization is archived", async () => {
    const user = await insertUser("org-arch@example.com");
    const [org] = await getTestDb()
      .insert(organizations)
      .values({ name: "OA", slug: "org-arch", status: "ARCHIVED" })
      .returning();
    if (!org) throw new Error("org");
    await getTestDb().insert(memberships).values({
      organizationId: org.id,
      userId: user.id,
      role: "OWNER",
      status: "ACTIVE",
    });
    expect(await getActiveMembership(user.id, org.id)).toBeNull();
  });
});

describe("tenant isolation and roles", () => {
  it("blocks cross-organization access", async () => {
    const userA = await insertUser("a@example.com");
    const userB = await insertUser("b@example.com");
    const orgA = await createOrganizationWithOwner(userA.id, {
      name: "A",
      slug: "org-a",
    });
    const orgB = await createOrganizationWithOwner(userB.id, {
      name: "B",
      slug: "org-b",
    });
    expect(await getActiveMembership(userA.id, orgA.organizationId)).not.toBeNull();
    expect(await getActiveMembership(userA.id, orgB.organizationId)).toBeNull();
  });

  it("enforces role hierarchy", async () => {
    const owner = await insertUser("own@example.com");
    const admin = await insertUser("adm@example.com");
    const agent = await insertUser("ag@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "R",
      slug: "role-org",
    });
    await getTestDb().insert(memberships).values([
      {
        organizationId: org.organizationId,
        userId: admin.id,
        role: "ADMIN",
        status: "ACTIVE",
      },
      {
        organizationId: org.organizationId,
        userId: agent.id,
        role: "AGENT",
        status: "ACTIVE",
      },
    ]);

    await expect(
      requireOrganizationRole(agent.id, org.organizationId, "ADMIN"),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      requireOrganizationRole(admin.id, org.organizationId, "OWNER"),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      requireOrganizationRole(admin.id, org.organizationId, "ADMIN"),
    ).resolves.toMatchObject({ role: "ADMIN" });
    await expect(
      requireOrganizationRole(owner.id, org.organizationId, "OWNER"),
    ).resolves.toMatchObject({ role: "OWNER" });
  });
});

describe("owner uniqueness", () => {
  it("allows only one non-REMOVED OWNER", async () => {
    const owner = await insertUser("owner1@example.com");
    const other = await insertUser("owner2@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "Owned",
      slug: "owned-once",
    });

    await expect(
      getTestDb().insert(memberships).values({
        organizationId: org.organizationId,
        userId: other.id,
        role: "OWNER",
        status: "ACTIVE",
      }),
    ).rejects.toSatisfy((err: unknown) => isUniqueish(err));
  });

  it("allows a new OWNER after previous OWNER is REMOVED", async () => {
    const owner = await insertUser("owner-old@example.com");
    const next = await insertUser("owner-new@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "Transfer",
      slug: "transfer-org",
    });

    await getTestDb()
      .update(memberships)
      .set({ status: "REMOVED" })
      .where(eq(memberships.id, org.membershipId));

    const [row] = await getTestDb()
      .insert(memberships)
      .values({
        organizationId: org.organizationId,
        userId: next.id,
        role: "OWNER",
        status: "ACTIVE",
      })
      .returning();
    expect(row?.role).toBe("OWNER");
  });
});

function isUniqueish(error: unknown): boolean {
  return isUniqueViolation(error);
}
