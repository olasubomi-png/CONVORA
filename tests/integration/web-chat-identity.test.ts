import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { customers, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createInstallation } from "@/lib/web-chat/installations";
import {
  createOrResumeVisitorSession,
  setVisitorIdentity,
  requireVisitorSession,
  sendVisitorMessage,
} from "@/lib/web-chat/visitor";
import { listOrganizationConversations } from "@/lib/conversations/list";
import { ValidationError, NotFoundError } from "@/lib/errors";
import { getTestDb, setupTestEnv, truncateAllTables } from "../helpers/db";
import { resetRateLimit } from "@/lib/rate-limit";
import { generateSessionToken } from "@/lib/web-chat/crypto";

beforeAll(() => {
  setupTestEnv();
});

beforeEach(async () => {
  await truncateAllTables();
  resetRateLimit();
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

async function setupInstallation(email: string, slug: string) {
  const owner = await seedUser(email);
  const org = await createOrganizationWithOwner(owner.id, {
    name: email,
    slug,
  });
  const installation = await createInstallation(owner.id, org.organizationId, {
    name: "Site",
  });
  return { owner, org, installation };
}

describe("web chat visitor identity", () => {
  it("creates session needing identity", async () => {
    const { installation } = await setupInstallation(
      "id-1@example.com",
      "id-1",
    );
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    expect(session.sessionToken).toBeTruthy();
    expect(session.visitor.displayName).toBeNull();
  });

  it("rejects short names", async () => {
    const { installation } = await setupInstallation(
      "id-2@example.com",
      "id-2",
    );
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    await expect(
      setVisitorIdentity(session.sessionToken, { displayName: "A" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("creates customer and links visitor", async () => {
    const { installation, org } = await setupInstallation(
      "id-3@example.com",
      "id-3",
    );
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    const result = await setVisitorIdentity(session.sessionToken, {
      displayName: "  John   Ade  ",
      email: "John@Example.COM",
    });
    expect(result.displayName).toBe("John Ade");
    expect(result.email).toBe("john@example.com");
    expect(result.customerId).toBeTruthy();
    expect(result.conversationId).toBeTruthy();

    const { visitor } = await requireVisitorSession(session.sessionToken);
    expect(visitor.displayName).toBe("John Ade");
    expect(visitor.customerId).toBe(result.customerId);

    const [c] = await getTestDb()
      .select()
      .from(customers)
      .where(eq(customers.id, result.customerId));
    expect(c?.displayName).toBe("John Ade");
    expect(c?.email).toBe("john@example.com");
    expect(c?.organizationId).toBe(org.organizationId);
  });

  it("returning session keeps identity", async () => {
    const { installation } = await setupInstallation(
      "id-4@example.com",
      "id-4",
    );
    const first = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    await setVisitorIdentity(first.sessionToken, {
      displayName: "Sarah",
      email: "sarah@example.com",
    });
    const resumed = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
      sessionToken: first.sessionToken,
    });
    expect(resumed.visitor.displayName).toBe("Sarah");
    expect(resumed.visitor.email).toBe("sarah@example.com");
  });

  it("handles email unique conflict without crashing", async () => {
    const { installation, org } = await setupInstallation(
      "id-5@example.com",
      "id-5",
    );
    await getTestDb().insert(customers).values({
      organizationId: org.organizationId,
      displayName: "Existing",
      email: "shared@example.com",
      status: "ACTIVE",
    });
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    const result = await setVisitorIdentity(session.sessionToken, {
      displayName: "New Person",
      email: "shared@example.com",
    });
    expect(result.displayName).toBe("New Person");
    expect(result.customerId).toBeTruthy();
  });

  it("agent inbox sees customer display name after message", async () => {
    const { installation, owner, org } = await setupInstallation(
      "id-6@example.com",
      "id-6",
    );
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    await setVisitorIdentity(session.sessionToken, {
      displayName: "John Ade",
    });
    await sendVisitorMessage(session.sessionToken, "Hello, I need help.");

    const list = await listOrganizationConversations(
      owner.id,
      org.organizationId,
    );
    expect(list.conversations.length).toBeGreaterThan(0);
    expect(list.conversations[0]!.customer.displayName).toBe("John Ade");
  });

  it("rejects unknown session token", async () => {
    await expect(
      setVisitorIdentity(generateSessionToken(), { displayName: "Xyz" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
