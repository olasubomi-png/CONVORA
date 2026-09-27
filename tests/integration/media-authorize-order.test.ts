import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { getTestDb, truncateAllTables } from "../helpers/db";
import { hashPassword } from "@/lib/auth/password";
import {
  users,
  organizations,
  memberships,
  mediaAssets,
  webChatInstallations,
  webChatVisitors,
  messages,
  conversations,
  customers,
  messageAttachments,
} from "@/db/schema";
import { authorizeMediaRead } from "@/lib/media/access";
import * as storage from "@/lib/storage";
import { NotFoundError, InternalError } from "@/lib/errors";
import { eq } from "drizzle-orm";

describe("private media authorization order", () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function seed() {
    const db = getTestDb();
    const passwordHash = await hashPassword("Password1!");
    const [user] = await db
      .insert(users)
      .values({
        email: `auth-order-${Date.now()}@test.com`,
        passwordHash,
        fullName: "Auth Order",
      })
      .returning();
    const [orgA] = await db
      .insert(organizations)
      .values({ name: "Org A Auth", slug: `org-a-auth-${Date.now()}` })
      .returning();
    const [orgB] = await db
      .insert(organizations)
      .values({ name: "Org B Auth", slug: `org-b-auth-${Date.now()}` })
      .returning();
    await db.insert(memberships).values({
      organizationId: orgA!.id,
      userId: user!.id,
      role: "OWNER",
      status: "ACTIVE",
    });

    const [inst] = await db
      .insert(webChatInstallations)
      .values({
        organizationId: orgA!.id,
        name: "Chat",
        publicKey: `pk_auth_${Date.now()}`,
        status: "ACTIVE",
        isDefault: true,
        config: {},
      })
      .returning();

    const tokenA = `visitor-token-a-${randomUUID()}`;
    const tokenB = `visitor-token-b-${randomUUID()}`;
    const [vA] = await db
      .insert(webChatVisitors)
      .values({
        organizationId: orgA!.id,
        installationId: inst!.id,
        sessionTokenHash: createHash("sha256").update(tokenA).digest("hex"),
        expiresAt: new Date(Date.now() + 86400000),
      })
      .returning();
    const [vB] = await db
      .insert(webChatVisitors)
      .values({
        organizationId: orgA!.id,
        installationId: inst!.id,
        sessionTokenHash: createHash("sha256").update(tokenB).digest("hex"),
        expiresAt: new Date(Date.now() + 86400000),
      })
      .returning();

    const [privateMedia] = await db
      .insert(mediaAssets)
      .values({
        organizationId: orgA!.id,
        kind: "chat",
        mimeType: "image/png",
        byteSize: 8,
        storageKey: `org/${orgA!.id}/chat/private.png`,
        visibility: "private",
        createdByVisitorId: vA!.id,
      })
      .returning();

    const [publicMedia] = await db
      .insert(mediaAssets)
      .values({
        organizationId: orgA!.id,
        kind: "avatar",
        mimeType: "image/png",
        byteSize: 8,
        storageKey: `org/${orgA!.id}/avatar/public.png`,
        visibility: "public",
      })
      .returning();

    const [foreignMedia] = await db
      .insert(mediaAssets)
      .values({
        organizationId: orgB!.id,
        kind: "chat",
        mimeType: "image/png",
        byteSize: 8,
        storageKey: `org/${orgB!.id}/chat/foreign.png`,
        visibility: "private",
      })
      .returning();

    return {
      orgA: orgA!,
      orgB: orgB!,
      user: user!,
      tokenA,
      tokenB,
      vA: vA!,
      vB: vB!,
      privateMedia: privateMedia!,
      publicMedia: publicMedia!,
      foreignMedia: foreignMedia!,
      inst: inst!,
    };
  }

  it("does not call storage get for unauthorized private media", async () => {
    const { privateMedia, tokenB } = await seed();
    const spy = vi
      .spyOn(storage, "readStorageObjectBytes")
      .mockResolvedValue(Buffer.from("secret"));

    await expect(
      authorizeMediaRead(privateMedia.id, { visitorToken: tokenB }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(spy).not.toHaveBeenCalled();
  });

  it("does not call storage get for cross-tenant private media", async () => {
    const { foreignMedia, tokenA } = await seed();
    const spy = vi
      .spyOn(storage, "readStorageObjectBytes")
      .mockResolvedValue(Buffer.from("secret"));

    await expect(
      authorizeMediaRead(foreignMedia.id, { visitorToken: tokenA }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(spy).not.toHaveBeenCalled();
  });

  it("authorized visitor can read their own media (storage called after auth)", async () => {
    const { privateMedia, tokenA } = await seed();
    const spy = vi
      .spyOn(storage, "readStorageObjectBytes")
      .mockResolvedValue(Buffer.from("png-bytes"));

    const result = await authorizeMediaRead(privateMedia.id, {
      visitorToken: tokenA,
    });
    expect(result.bytes.toString()).toBe("png-bytes");
    expect(spy).toHaveBeenCalledWith(privateMedia.storageKey);
  });

  it("visitor can read media attached to their conversation", async () => {
    const db = getTestDb();
    const { orgA, tokenA, vA } = await seed();

    const [cust] = await db
      .insert(customers)
      .values({ organizationId: orgA.id, displayName: "Cust" })
      .returning();
    const [conv] = await db
      .insert(conversations)
      .values({
        organizationId: orgA.id,
        customerId: cust!.id,
        channel: "WEB",
        status: "OPEN",
      })
      .returning();

    await db
      .update(webChatVisitors)
      .set({ conversationId: conv!.id })
      .where(eq(webChatVisitors.id, vA.id));

    const [agentMedia] = await db
      .insert(mediaAssets)
      .values({
        organizationId: orgA.id,
        kind: "chat",
        mimeType: "image/png",
        byteSize: 4,
        storageKey: `org/${orgA.id}/chat/agent-reply.png`,
        visibility: "private",
      })
      .returning();

    const [msg] = await db
      .insert(messages)
      .values({
        conversationId: conv!.id,
        senderType: "SYSTEM",
        body: "[image]",
        messageType: "IMAGE",
      })
      .returning();

    await db.insert(messageAttachments).values({
      messageId: msg!.id,
      organizationId: orgA.id,
      mediaAssetId: agentMedia!.id,
      mimeType: "image/png",
      byteSize: 4,
    });
    await db
      .update(mediaAssets)
      .set({ consumedByMessageId: msg!.id })
      .where(eq(mediaAssets.id, agentMedia!.id));

    const spy = vi
      .spyOn(storage, "readStorageObjectBytes")
      .mockResolvedValue(Buffer.from("agent-img"));

    const result = await authorizeMediaRead(agentMedia!.id, {
      visitorToken: tokenA,
    });
    expect(result.bytes.toString()).toBe("agent-img");
    expect(spy).toHaveBeenCalled();
  });

  it("public media still loads storage after metadata", async () => {
    const { publicMedia } = await seed();
    const spy = vi
      .spyOn(storage, "readStorageObjectBytes")
      .mockResolvedValue(Buffer.from("public"));

    const result = await authorizeMediaRead(publicMedia.id);
    expect(result.bytes.toString()).toBe("public");
    expect(spy).toHaveBeenCalledWith(publicMedia.storageKey);
  });

  it("missing storage object surfaces as not found after auth", async () => {
    const { privateMedia, tokenA } = await seed();
    vi.spyOn(storage, "readStorageObjectBytes").mockRejectedValue(
      new NotFoundError("Object not found."),
    );

    await expect(
      authorizeMediaRead(privateMedia.id, { visitorToken: tokenA }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("storage provider failure is not converted to false 404 at service layer", async () => {
    const { privateMedia, tokenA } = await seed();
    vi.spyOn(storage, "readStorageObjectBytes").mockRejectedValue(
      new InternalError("Media storage read failed."),
    );

    await expect(
      authorizeMediaRead(privateMedia.id, { visitorToken: tokenA }),
    ).rejects.toBeInstanceOf(InternalError);
  });
});
