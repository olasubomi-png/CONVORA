import { describe, expect, it, beforeAll } from "vitest";
import { getTestDb, truncateAllTables } from "../helpers/db";
import { hashPassword } from "@/lib/auth/password";
import {
  users,
  organizations,
  mediaAssets,
  webChatInstallations,
  webChatVisitors,
  messages,
  conversations,
  customers,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  requireVisitorMediaAttach,
  requireMediaInOrganization,
} from "@/lib/storage";
import { ValidationError, NotFoundError } from "@/lib/errors";

describe("media ownership", () => {
  beforeAll(async () => {
    await truncateAllTables();
  });

  it("rejects cross-org media attachment", async () => {
    const db = getTestDb();
    const passwordHash = await hashPassword("Password1!");
    const [u] = await db
      .insert(users)
      .values({
        email: "media-own@test.com",
        passwordHash,
        fullName: "Media Own",
      })
      .returning();
    const [orgA] = await db
      .insert(organizations)
      .values({ name: "Org A", slug: "org-a-media" })
      .returning();
    const [orgB] = await db
      .insert(organizations)
      .values({ name: "Org B", slug: "org-b-media" })
      .returning();

    const [mediaA] = await db
      .insert(mediaAssets)
      .values({
        organizationId: orgA!.id,
        kind: "chat",
        mimeType: "image/png",
        byteSize: 10,
        storageKey: `org/${orgA!.id}/chat/test.png`,
        visibility: "private",
        createdByUserId: u!.id,
      })
      .returning();

    await expect(
      requireMediaInOrganization(mediaA!.id, orgB!.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects visitor attaching another visitor's media", async () => {
    const db = getTestDb();
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, "org-a-media"))
      .limit(1);
    if (!org) throw new Error("setup missing org");

    const [inst] = await db
      .insert(webChatInstallations)
      .values({
        organizationId: org.id,
        name: "Chat",
        publicKey: "pk_media_test_aaaaaaaa",
        status: "ACTIVE",
        isDefault: true,
        config: {},
      })
      .returning();

    const [v1] = await db
      .insert(webChatVisitors)
      .values({
        organizationId: org.id,
        installationId: inst!.id,
        sessionTokenHash: "hash1" + "x".repeat(50),
        expiresAt: new Date(Date.now() + 86400000),
      })
      .returning();
    const [v2] = await db
      .insert(webChatVisitors)
      .values({
        organizationId: org.id,
        installationId: inst!.id,
        sessionTokenHash: "hash2" + "x".repeat(50),
        expiresAt: new Date(Date.now() + 86400000),
      })
      .returning();

    const [media] = await db
      .insert(mediaAssets)
      .values({
        organizationId: org.id,
        kind: "chat",
        mimeType: "image/png",
        byteSize: 12,
        storageKey: `org/${org.id}/chat/v1.png`,
        visibility: "private",
        createdByVisitorId: v1!.id,
      })
      .returning();

    await expect(
      requireVisitorMediaAttach(media!.id, org.id, v2!.id),
    ).rejects.toBeInstanceOf(NotFoundError);

    const ok = await requireVisitorMediaAttach(media!.id, org.id, v1!.id);
    expect(ok.id).toBe(media!.id);
  });

  it("rejects already-consumed media", async () => {
    const db = getTestDb();
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, "org-a-media"))
      .limit(1);
    const [cust] = await db
      .insert(customers)
      .values({
        organizationId: org!.id,
        displayName: "C",
      })
      .returning();
    const [conv] = await db
      .insert(conversations)
      .values({
        organizationId: org!.id,
        customerId: cust!.id,
        channel: "WEB",
        status: "OPEN",
      })
      .returning();
    const [msg] = await db
      .insert(messages)
      .values({
        conversationId: conv!.id,
        senderType: "CUSTOMER",
        senderCustomerId: cust!.id,
        body: "x",
        messageType: "TEXT",
      })
      .returning();

    const [visitor] = await db
      .select()
      .from(webChatVisitors)
      .limit(1);

    const [media] = await db
      .insert(mediaAssets)
      .values({
        organizationId: org!.id,
        kind: "chat",
        mimeType: "image/png",
        byteSize: 12,
        storageKey: `org/${org!.id}/chat/consumed.png`,
        visibility: "private",
        createdByVisitorId: visitor!.id,
        consumedByMessageId: msg!.id,
      })
      .returning();

    await expect(
      requireVisitorMediaAttach(media!.id, org!.id, visitor!.id),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
