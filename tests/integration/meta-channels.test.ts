import { createHmac } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  users,
  messages,
  conversations,
  customers,
  channelInstallations,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { processInboundEvent } from "@/lib/channels/inbound";
import { FacebookMessengerAdapter } from "@/lib/channels/providers/facebook/adapter";
import {
  createFacebookInstallation,
  loadFacebookCredentials,
} from "@/lib/channels/providers/facebook/installations";
import { InstagramMessagingAdapter } from "@/lib/channels/providers/instagram/adapter";
import {
  createInstagramInstallation,
  loadInstagramCredentials,
} from "@/lib/channels/providers/instagram/installations";
import { AuthorizationError } from "@/lib/errors";
import { getTestDb, setupTestEnv, truncateAllTables } from "../helpers/db";
import { resetChannelAdapterRegistry } from "@/lib/channels/registry";
import { memberships } from "@/db/schema";
import { requirePermission } from "@/lib/authz/permissions";

beforeAll(() => {
  setupTestEnv();
});

beforeEach(async () => {
  await truncateAllTables();
  resetChannelAdapterRegistry();
});

function sign(body: string, secret: string): string {
  return (
    "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex")
  );
}

async function seedUser(email: string) {
  const passwordHash = await hashPassword("securepass1");
  const [user] = await getTestDb()
    .insert(users)
    .values({ email, passwordHash, fullName: email })
    .returning();
  if (!user) throw new Error("user");
  return user;
}

function facebookPayload(opts: {
  pageId: string;
  senderId: string;
  mid: string;
  text: string;
}) {
  return JSON.stringify({
    object: "page",
    entry: [
      {
        id: opts.pageId,
        time: 1700000000,
        messaging: [
          {
            sender: { id: opts.senderId },
            recipient: { id: opts.pageId },
            timestamp: 1700000000000,
            message: { mid: opts.mid, text: opts.text },
          },
        ],
      },
    ],
  });
}

function instagramPayload(opts: {
  igId: string;
  senderId: string;
  mid: string;
  text: string;
}) {
  return JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: opts.igId,
        time: 1700000000,
        messaging: [
          {
            sender: { id: opts.senderId },
            recipient: { id: opts.igId },
            timestamp: 1700000000000,
            message: { mid: opts.mid, text: opts.text },
          },
        ],
      },
    ],
  });
}

describe("Facebook Messenger", () => {
  it("accepts signed inbound text, is idempotent, omits secrets", async () => {
    const owner = await seedUser("fb-own@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "FB",
      slug: "fb-1",
    });
    const installation = await createFacebookInstallation(
      owner.id,
      org.organizationId,
      {
        displayName: "Page",
        credentials: {
          pageAccessToken: "EAAB_page_access_token_value_12",
          appSecret: "fb_app_secret_12",
          verifyToken: "fb_verify_token_12",
          pageId: "page_1001",
        },
      },
    );
    const json = JSON.stringify(installation);
    expect(json).not.toContain("EAAB_page_access_token_value_12");
    expect(json).not.toContain("fb_app_secret_12");

    const rows = await getTestDb()
      .select()
      .from(channelInstallations)
      .where(eq(channelInstallations.id, installation.id));
    const creds = loadFacebookCredentials(rows[0]!);
    const adapter = new FacebookMessengerAdapter(creds);

    const body = facebookPayload({
      pageId: "page_1001",
      senderId: "psid_1",
      mid: "mid_fb_1",
      text: "Hello from Messenger",
    });
    const headers = { "x-hub-signature-256": sign(body, "fb_app_secret_12") };

    const first = await processInboundEvent({
      installationId: installation.id,
      adapter,
      headers,
      body,
    });
    expect(first.processed).toBeGreaterThanOrEqual(1);
    expect(first.results.some((r) => !("duplicate" in r && r.duplicate))).toBe(
      true,
    );

    const second = await processInboundEvent({
      installationId: installation.id,
      adapter,
      headers,
      body,
    });
    expect(second.results.every((r) => "duplicate" in r && r.duplicate)).toBe(
      true,
    );

    const msgs = await getTestDb().select().from(messages);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.body).toBe("Hello from Messenger");

    const convs = await getTestDb().select().from(conversations);
    expect(convs[0]?.channel).toBe("FACEBOOK");
  });

  it("rejects invalid signature", async () => {
    const owner = await seedUser("fb-sig@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "FBS",
      slug: "fb-s",
    });
    const installation = await createFacebookInstallation(
      owner.id,
      org.organizationId,
      {
        displayName: "Page",
        credentials: {
          pageAccessToken: "EAAB_page_access_token_value_99",
          appSecret: "fb_app_secret_99",
          verifyToken: "fb_verify_token_99",
          pageId: "page_2002",
        },
      },
    );
    const rows = await getTestDb()
      .select()
      .from(channelInstallations)
      .where(eq(channelInstallations.id, installation.id));
    const adapter = new FacebookMessengerAdapter(
      loadFacebookCredentials(rows[0]!),
    );
    const body = facebookPayload({
      pageId: "page_2002",
      senderId: "psid_2",
      mid: "mid_bad",
      text: "nope",
    });
    await expect(
      processInboundEvent({
        installationId: installation.id,
        adapter,
        headers: { "x-hub-signature-256": sign(body, "wrong_secret_xx") },
        body,
      }),
    ).rejects.toThrow();
  });

  it("agent cannot manage facebook installation", async () => {
    const owner = await seedUser("fb-ag-o@example.com");
    const agent = await seedUser("fb-ag-a@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "FBA",
      slug: "fb-a",
    });
    await getTestDb().insert(memberships).values({
      organizationId: org.organizationId,
      userId: agent.id,
      role: "AGENT",
      status: "ACTIVE",
    });
    await expect(
      createFacebookInstallation(agent.id, org.organizationId, {
        displayName: "X",
        credentials: {
          pageAccessToken: "EAAB_page_access_token_value_aa",
          appSecret: "fb_app_secret_aa",
          verifyToken: "fb_verify_token_aa",
          pageId: "page_agent",
        },
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      requirePermission(agent.id, org.organizationId, "channels.manage"),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("Instagram Messaging", () => {
  it("accepts signed inbound text and keeps identity separate from Facebook", async () => {
    const owner = await seedUser("ig-own@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "IG",
      slug: "ig-1",
    });
    const installation = await createInstagramInstallation(
      owner.id,
      org.organizationId,
      {
        displayName: "IG Pro",
        credentials: {
          pageAccessToken: "EAAB_ig_page_token_value_12",
          appSecret: "ig_app_secret_12",
          verifyToken: "ig_verify_token_12",
          instagramAccountId: "ig_9001",
          pageId: "page_ig_1",
        },
      },
    );
    const json = JSON.stringify(installation);
    expect(json).not.toContain("EAAB_ig_page_token_value_12");
    expect(json).not.toContain("ig_app_secret_12");

    const rows = await getTestDb()
      .select()
      .from(channelInstallations)
      .where(eq(channelInstallations.id, installation.id));
    const adapter = new InstagramMessagingAdapter(
      loadInstagramCredentials(rows[0]!),
    );

    const body = instagramPayload({
      igId: "ig_9001",
      senderId: "igsid_1",
      mid: "mid_ig_1",
      text: "Hello from Instagram",
    });
    const headers = { "x-hub-signature-256": sign(body, "ig_app_secret_12") };

    await processInboundEvent({
      installationId: installation.id,
      adapter,
      headers,
      body,
    });
    await processInboundEvent({
      installationId: installation.id,
      adapter,
      headers,
      body,
    });

    const msgs = await getTestDb().select().from(messages);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.body).toBe("Hello from Instagram");
    const convs = await getTestDb().select().from(conversations);
    expect(convs[0]?.channel).toBe("INSTAGRAM");
    const custs = await getTestDb().select().from(customers);
    expect(custs).toHaveLength(1);
  });

  it("rejects invalid signature", async () => {
    const owner = await seedUser("ig-sig@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "IGS",
      slug: "ig-s",
    });
    const installation = await createInstagramInstallation(
      owner.id,
      org.organizationId,
      {
        displayName: "IG",
        credentials: {
          pageAccessToken: "EAAB_ig_page_token_value_99",
          appSecret: "ig_app_secret_99",
          verifyToken: "ig_verify_token_99",
          instagramAccountId: "ig_bad",
        },
      },
    );
    const rows = await getTestDb()
      .select()
      .from(channelInstallations)
      .where(eq(channelInstallations.id, installation.id));
    const adapter = new InstagramMessagingAdapter(
      loadInstagramCredentials(rows[0]!),
    );
    const body = instagramPayload({
      igId: "ig_bad",
      senderId: "igsid_x",
      mid: "mid_x",
      text: "x",
    });
    await expect(
      processInboundEvent({
        installationId: installation.id,
        adapter,
        headers: { "x-hub-signature-256": "sha256=deadbeef" },
        body,
      }),
    ).rejects.toThrow();
  });
});
