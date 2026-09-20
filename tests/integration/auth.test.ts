import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users, sessions, memberships, organizations } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSessionRecord, getSessionByToken, revokeSession } from "@/lib/auth/session";
import { registerUser } from "@/lib/auth/register";
import { loginUser } from "@/lib/auth/login";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { getActiveMembership, requireOrganizationRole } from "@/lib/authz/membership";
import { ConflictError, AuthenticationError, AuthorizationError } from "@/lib/errors";
import { getTestDb, setupTestEnv, truncateAllTables } from "../helpers/db";

beforeAll(() => { setupTestEnv(); });
beforeEach(async () => { await truncateAllTables(); });

describe("registration", () => {
  it("creates user with hashed password and normalized email", async () => {
    const result = await registerUser({ email: "Alex@Example.COM", password: "securepass1", fullName: "Alex" }, { setCookie: false });
    const rows = await getTestDb().select().from(users).where(eq(users.id, result.userId));
    expect(rows[0]?.email).toBe("alex@example.com");
    expect(rows[0]?.passwordHash).not.toContain("securepass1");
  });
  it("rejects duplicate emails", async () => {
    await registerUser({ email: "dup@example.com", password: "securepass1", fullName: "Dup" }, { setCookie: false });
    await expect(registerUser({ email: "DUP@example.com", password: "securepass1", fullName: "Dup2" }, { setCookie: false })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("login", () => {
  it("rejects invalid credentials", async () => {
    await expect(loginUser({ email: "nobody@example.com", password: "securepass1" }, { setCookie: false })).rejects.toBeInstanceOf(AuthenticationError);
  });
  it("accepts valid credentials", async () => {
    await registerUser({ email: "ok@example.com", password: "securepass1", fullName: "Ok" }, { setCookie: false });
    const result = await loginUser({ email: "ok@example.com", password: "securepass1" }, { setCookie: false });
    expect(result.userId).toBeTruthy();
  });
});

describe("sessions", () => {
  it("creates, resolves, and revokes sessions", async () => {
    const passwordHash = await hashPassword("securepass1");
    const [user] = await getTestDb().insert(users).values({ email: "s@example.com", passwordHash, fullName: "S" }).returning();
    if (!user) throw new Error("user");
    const record = await createSessionRecord(user.id);
    expect((await getSessionByToken(record.token))?.user.id).toBe(user.id);
    await revokeSession(record.sessionId);
    expect(await getSessionByToken(record.token)).toBeNull();
  });
  it("rejects expired sessions", async () => {
    const passwordHash = await hashPassword("securepass1");
    const [user] = await getTestDb().insert(users).values({ email: "e@example.com", passwordHash, fullName: "E" }).returning();
    if (!user) throw new Error("user");
    const { hashSessionToken, generateSessionToken } = await import("@/lib/auth/tokens");
    const token = generateSessionToken();
    await getTestDb().insert(sessions).values({ userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() - 1000) });
    expect(await getSessionByToken(token)).toBeNull();
  });
});

describe("organizations", () => {
  it("creates org with OWNER membership", async () => {
    const passwordHash = await hashPassword("securepass1");
    const [user] = await getTestDb().insert(users).values({ email: "o@example.com", passwordHash, fullName: "O" }).returning();
    if (!user) throw new Error("user");
    const result = await createOrganizationWithOwner(user.id, { name: "Acme", slug: "acme" });
    const m = await getActiveMembership(user.id, result.organizationId);
    expect(m?.role).toBe("OWNER");
  });
  it("rejects duplicate slugs", async () => {
    const passwordHash = await hashPassword("securepass1");
    const [user] = await getTestDb().insert(users).values({ email: "slug@example.com", passwordHash, fullName: "S" }).returning();
    if (!user) throw new Error("user");
    await createOrganizationWithOwner(user.id, { name: "One", slug: "shared" });
    await expect(createOrganizationWithOwner(user.id, { name: "Two", slug: "shared" })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("tenant isolation", () => {
  it("blocks cross-organization access", async () => {
    const passwordHash = await hashPassword("securepass1");
    const [userA] = await getTestDb().insert(users).values({ email: "a@example.com", passwordHash, fullName: "A" }).returning();
    const [userB] = await getTestDb().insert(users).values({ email: "b@example.com", passwordHash, fullName: "B" }).returning();
    if (!userA || !userB) throw new Error("users");
    const orgA = await createOrganizationWithOwner(userA.id, { name: "A", slug: "org-a" });
    const orgB = await createOrganizationWithOwner(userB.id, { name: "B", slug: "org-b" });
    expect(await getActiveMembership(userA.id, orgA.organizationId)).not.toBeNull();
    expect(await getActiveMembership(userA.id, orgB.organizationId)).toBeNull();
  });
  it("rejects AGENT for admin operations", async () => {
    const passwordHash = await hashPassword("securepass1");
    const [owner] = await getTestDb().insert(users).values({ email: "own@example.com", passwordHash, fullName: "Own" }).returning();
    const [agent] = await getTestDb().insert(users).values({ email: "ag@example.com", passwordHash, fullName: "Ag" }).returning();
    if (!owner || !agent) throw new Error("users");
    const org = await createOrganizationWithOwner(owner.id, { name: "R", slug: "role-org" });
    await getTestDb().insert(memberships).values({ organizationId: org.organizationId, userId: agent.id, role: "AGENT", status: "ACTIVE" });
    await expect(requireOrganizationRole(agent.id, org.organizationId, "ADMIN")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(requireOrganizationRole(owner.id, org.organizationId, "ADMIN")).resolves.toMatchObject({ role: "OWNER" });
  });
  it("ignores suspended memberships", async () => {
    const passwordHash = await hashPassword("securepass1");
    const [user] = await getTestDb().insert(users).values({ email: "sus@example.com", passwordHash, fullName: "Sus" }).returning();
    if (!user) throw new Error("user");
    const [org] = await getTestDb().insert(organizations).values({ name: "S", slug: "sus-org" }).returning();
    if (!org) throw new Error("org");
    await getTestDb().insert(memberships).values({ organizationId: org.id, userId: user.id, role: "AGENT", status: "SUSPENDED" });
    expect(await getActiveMembership(user.id, org.id)).toBeNull();
  });
});
