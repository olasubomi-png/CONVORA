import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users, conversations } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createInstallation } from "@/lib/web-chat/installations";
import {
  createOrResumeVisitorSession,
  sendVisitorMessage,
  listVisitorMessages,
} from "@/lib/web-chat/visitor";
import { sendAgentMessage } from "@/lib/conversations/messages";
import {
  AuthorizationError,
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

describe("web chat channel", () => {
  it("creates installation, session, conversation, and messages", async () => {
    const owner = await seedUser("wc1@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "WC",
      slug: "wc-org-1",
    });
    const installation = await createInstallation(owner.id, org.organizationId, {
      name: "Main site",
    });

    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    expect(session.sessionToken).toBeTruthy();

    const msg = await sendVisitorMessage(session.sessionToken, "Hello from site");
    expect(msg.senderType).toBe("CUSTOMER");

    const listed = await listVisitorMessages(session.sessionToken);
    expect(listed.messages.some((m) => m.body === "Hello from site")).toBe(
      true,
    );

    // Appears in org inbox as WEB channel
    const convs = await getTestDb()
      .select()
      .from(conversations)
      .where(eq(conversations.organizationId, org.organizationId));
    expect(convs).toHaveLength(1);
    expect(convs[0]?.channel).toBe("WEB");

    // Agent can reply via existing domain
    await sendAgentMessage(owner.id, convs[0]!.id, "We got your message");
    const again = await listVisitorMessages(session.sessionToken);
    expect(again.messages.some((m) => m.role === "agent")).toBe(true);
  });

  it("isolates visitors and installations across orgs", async () => {
    const a = await seedUser("wc-a@example.com");
    const b = await seedUser("wc-b@example.com");
    const orgA = await createOrganizationWithOwner(a.id, {
      name: "A",
      slug: "wc-a",
    });
    const orgB = await createOrganizationWithOwner(b.id, {
      name: "B",
      slug: "wc-b",
    });
    const instA = await createInstallation(a.id, orgA.organizationId, {
      name: "A site",
    });
    const instB = await createInstallation(b.id, orgB.organizationId, {
      name: "B site",
    });

    const sessA = await createOrResumeVisitorSession({
      publicKey: instA.publicKey,
      origin: null,
    });
    await sendVisitorMessage(sessA.sessionToken, "A only");

    await expect(
      createOrResumeVisitorSession({
        publicKey: "wc_invalid_key_xxxxx",
        origin: null,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // Resume wrong org key with A's token should create new visitor under B if key is B's
    const sessB = await createOrResumeVisitorSession({
      publicKey: instB.publicKey,
      origin: null,
      sessionToken: sessA.sessionToken,
    });
    // Token was for A; not valid for B installation → new session for B
    expect(sessB.sessionToken).not.toBe(sessA.sessionToken);
  });

  it("enforces allowed origins when configured", async () => {
    const owner = await seedUser("wc-o@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "O",
      slug: "wc-orig",
    });
    const installation = await createInstallation(owner.id, org.organizationId, {
      name: "Restricted",
      allowedOrigins: ["https://allowed.example"],
    });
    await expect(
      createOrResumeVisitorSession({
        publicKey: installation.publicKey,
        origin: "https://evil.example",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const ok = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: "https://allowed.example",
    });
    expect(ok.sessionToken).toBeTruthy();
  });

  it("rejects empty messages and resumes session", async () => {
    const owner = await seedUser("wc-r@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "R",
      slug: "wc-resume",
    });
    const installation = await createInstallation(owner.id, org.organizationId, {
      name: "R",
    });
    const s1 = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    const s2 = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
      sessionToken: s1.sessionToken,
    });
    expect(s2.sessionToken).toBe(s1.sessionToken);
    await expect(
      sendVisitorMessage(s1.sessionToken, "   "),
    ).rejects.toBeTruthy();
  });
});
