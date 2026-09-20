import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  users,
  messages,
  conversations,
  customers,
  webChatVisitors,
  conversationNotes,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import {
  createInstallation,
  rotateInstallationPublicKey,
  updateInstallation,
} from "@/lib/web-chat/installations";
import {
  createOrResumeVisitorSession,
  sendVisitorMessage,
  listVisitorMessages,
  requireVisitorSession,
} from "@/lib/web-chat/visitor";
import { sendAgentMessage } from "@/lib/conversations/messages";
import {
  AuthorizationError,
  NotFoundError,
} from "@/lib/errors";
import { getTestDb, setupTestEnv, truncateAllTables } from "../helpers/db";
import { resetRateLimit } from "@/lib/rate-limit";

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

describe("session security", () => {
  it("rejects invalid and expired tokens", async () => {
    const { installation } = await setupInstallation(
      "wc-s1@example.com",
      "wc-s1",
    );
    await expect(
      requireVisitorSession("not-a-real-token-value-xxx"),
    ).rejects.toBeInstanceOf(NotFoundError);

    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    // Force expire
    await getTestDb()
      .update(webChatVisitors)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(webChatVisitors.id, session.visitor.id));
    await expect(
      requireVisitorSession(session.sessionToken),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("rejects disabled installation for existing session", async () => {
    const { owner, installation } = await setupInstallation(
      "wc-dis@example.com",
      "wc-dis",
    );
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    await updateInstallation(owner.id, installation.id, { status: "DISABLED" });
    await expect(
      sendVisitorMessage(session.sessionToken, "hello"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects old public key after rotation", async () => {
    const { owner, installation } = await setupInstallation(
      "wc-rot@example.com",
      "wc-rot",
    );
    const oldKey = installation.publicKey;
    const rotated = await rotateInstallationPublicKey(owner.id, installation.id);
    expect(rotated?.publicKey).not.toBe(oldKey);
    await expect(
      createOrResumeVisitorSession({ publicKey: oldKey, origin: null }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const ok = await createOrResumeVisitorSession({
      publicKey: rotated!.publicKey,
      origin: null,
    });
    expect(ok.sessionToken).toBeTruthy();
  });
});

describe("concurrency and idempotency", () => {
  it("concurrent first messages create one customer and conversation", async () => {
    const { installation } = await setupInstallation(
      "wc-race@example.com",
      "wc-race",
    );
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });

    await Promise.all([
      sendVisitorMessage(session.sessionToken, "a", crypto.randomUUID()),
      sendVisitorMessage(session.sessionToken, "b", crypto.randomUUID()),
    ]);

    const cust = await getTestDb()
      .select()
      .from(customers)
      .where(eq(customers.organizationId, installation.organizationId));
    const conv = await getTestDb()
      .select()
      .from(conversations)
      .where(eq(conversations.organizationId, installation.organizationId));
    expect(cust).toHaveLength(1);
    expect(conv).toHaveLength(1);
  });

  it("concurrent identical clientMessageId yields one message", async () => {
    const { installation } = await setupInstallation(
      "wc-idem@example.com",
      "wc-idem",
    );
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    const id = crypto.randomUUID();
    const results = await Promise.all([
      sendVisitorMessage(session.sessionToken, "hello", id),
      sendVisitorMessage(session.sessionToken, "hello", id),
    ]);
    expect(results[0].id).toBe(results[1].id);
    const msgs = await getTestDb().select().from(messages);
    expect(msgs).toHaveLength(1);
  });
});

describe("visibility and origin", () => {
  it("does not expose internal notes to visitor", async () => {
    const { owner, installation } = await setupInstallation(
      "wc-note@example.com",
      "wc-note",
    );
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    await sendVisitorMessage(session.sessionToken, "hi");
    const conv = (
      await getTestDb()
        .select()
        .from(conversations)
        .where(eq(conversations.organizationId, installation.organizationId))
    )[0]!;
    const { memberships: memTable } = await import("@/db/schema");
    const [mem] = await getTestDb()
      .select()
      .from(memTable)
      .where(eq(memTable.userId, owner.id))
      .limit(1);
    await getTestDb().insert(conversationNotes).values({
      conversationId: conv.id,
      authorMembershipId: mem!.id,
      body: "SECRET INTERNAL NOTE",
    });
    await sendAgentMessage(owner.id, conv.id, "public reply");
    const listed = await listVisitorMessages(session.sessionToken);
    expect(
      listed.messages.every((m) => !m.body.includes("SECRET")),
    ).toBe(true);
    expect(listed.messages.some((m) => m.role === "agent")).toBe(true);
  });

  it("enforces exact origin match", async () => {
    const owner = await seedUser("wc-orig2@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "O",
      slug: "wc-orig2",
    });
    const installation = await createInstallation(owner.id, org.organizationId, {
      name: "R",
      allowedOrigins: ["https://example.com"],
    });
    await expect(
      createOrResumeVisitorSession({
        publicKey: installation.publicKey,
        origin: "https://evil-example.com",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      createOrResumeVisitorSession({
        publicKey: installation.publicKey,
        origin: "https://example.com.evil.com",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      createOrResumeVisitorSession({
        publicKey: installation.publicKey,
        origin: "http://example.com",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
