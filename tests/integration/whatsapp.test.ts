import { createHmac } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  users,
  messages,
  conversations,
  customers,
  channelInboundEvents,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createWhatsAppInstallation } from "@/lib/channels/providers/whatsapp/installations";
import { processInboundEvent } from "@/lib/channels/inbound";
import { resetChannelAdapterRegistry } from "@/lib/channels/registry";
import { WhatsAppCloudAdapter } from "@/lib/channels/providers/whatsapp/adapter";
import { loadWhatsAppCredentials } from "@/lib/channels/providers/whatsapp/installations";
import { AuthorizationError } from "@/lib/errors";
import { getTestDb, setupTestEnv, truncateAllTables } from "../helpers/db";
import { getDatabase } from "@/db";
import { channelInstallations } from "@/db/schema";

const APP_SECRET = "test-app-secret-value";
const VERIFY = "test-verify-token-xx";
const ACCESS = "EAATESTTOKEN1234567890";

beforeAll(() => {
  setupTestEnv();
});

beforeEach(async () => {
  await truncateAllTables();
  resetChannelAdapterRegistry();
});

function sign(body: string): string {
  return (
    "sha256=" +
    createHmac("sha256", APP_SECRET).update(body, "utf8").digest("hex")
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

async function setupWa(email: string, slug: string, phoneNumberId = "pn-1") {
  const owner = await seedUser(email);
  const org = await createOrganizationWithOwner(owner.id, {
    name: email,
    slug,
  });
  const installation = await createWhatsAppInstallation(
    owner.id,
    org.organizationId,
    {
      displayName: "WA",
      credentials: {
        accessToken: ACCESS,
        appSecret: APP_SECRET,
        verifyToken: VERIFY,
        phoneNumberId,
      },
    },
  );
  const full = (
    await getDatabase()
      .select()
      .from(channelInstallations)
      .where(eq(channelInstallations.id, installation.id))
  )[0]!;
  const creds = loadWhatsAppCredentials(full);
  const adapter = new WhatsAppCloudAdapter(creds);
  return { owner, org, installation, adapter };
}

function textPayload(opts: {
  eventId: string;
  from: string;
  text: string;
  phoneNumberId?: string;
}) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                phone_number_id: opts.phoneNumberId ?? "pn-1",
              },
              contacts: [{ wa_id: opts.from, profile: { name: "Bob" } }],
              messages: [
                {
                  from: opts.from,
                  id: opts.eventId,
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: opts.text },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

describe("WhatsApp Cloud integration", () => {
  it("creates installation without exposing secrets", async () => {
    const { installation } = await setupWa("wa1@example.com", "wa-1");
    expect(
      (installation as { encryptedConfig?: unknown }).encryptedConfig,
    ).toBeUndefined();
    expect(
      (installation.publicConfig as { phoneNumberId?: string }).phoneNumberId,
    ).toBe("pn-1");
  });

  it("accepts valid signed text webhook", async () => {
    const { installation, adapter } = await setupWa("wa2@example.com", "wa-2");
    const body = textPayload({
      eventId: "wamid.1",
      from: "15551234567",
      text: "Hello WA",
    });
    const result = await processInboundEvent({
      installationId: installation.id,
      adapter,
      headers: { "x-hub-signature-256": sign(body) },
      body,
    });
    expect(result.processed).toBe(1);
    const msgs = await getTestDb().select().from(messages);
    expect(msgs.some((m) => m.body === "Hello WA")).toBe(true);
    const conv = await getTestDb().select().from(conversations);
    expect(conv[0]?.channel).toBe("WHATSAPP");
  });

  it("rejects invalid signature", async () => {
    const { installation, adapter } = await setupWa("wa3@example.com", "wa-3");
    const body = textPayload({
      eventId: "wamid.2",
      from: "15550001111",
      text: "nope",
    });
    await expect(
      processInboundEvent({
        installationId: installation.id,
        adapter,
        headers: { "x-hub-signature-256": "sha256=deadbeef" },
        body,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("idempotent on duplicate provider message id", async () => {
    const { installation, adapter } = await setupWa("wa4@example.com", "wa-4");
    const body = textPayload({
      eventId: "wamid.dup",
      from: "15550002222",
      text: "once",
    });
    const headers = { "x-hub-signature-256": sign(body) };
    await processInboundEvent({
      installationId: installation.id,
      adapter,
      headers,
      body,
    });
    const again = await processInboundEvent({
      installationId: installation.id,
      adapter,
      headers,
      body,
    });
    expect(again.results[0]?.duplicate).toBe(true);
    const msgs = await getTestDb().select().from(messages);
    expect(msgs).toHaveLength(1);
    const events = await getTestDb().select().from(channelInboundEvents);
    expect(events).toHaveLength(1);
  });

  it("isolates same external id across organizations", async () => {
    const a = await setupWa("wa5a@example.com", "wa-5a", "pn-a");
    const b = await setupWa("wa5b@example.com", "wa-5b", "pn-b");
    const bodyA = textPayload({
      eventId: "wamid.a",
      from: "15559999999",
      text: "A",
      phoneNumberId: "pn-a",
    });
    const bodyB = textPayload({
      eventId: "wamid.b",
      from: "15559999999",
      text: "B",
      phoneNumberId: "pn-b",
    });
    await processInboundEvent({
      installationId: a.installation.id,
      adapter: a.adapter,
      headers: { "x-hub-signature-256": sign(bodyA) },
      body: bodyA,
    });
    await processInboundEvent({
      installationId: b.installation.id,
      adapter: b.adapter,
      headers: {
        "x-hub-signature-256":
          "sha256=" +
          createHmac("sha256", APP_SECRET).update(bodyB, "utf8").digest("hex"),
      },
      body: bodyB,
    });
    const cust = await getTestDb().select().from(customers);
    expect(cust.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects agent creating whatsapp installation", async () => {
    const owner = await seedUser("wa6o@example.com");
    const agent = await seedUser("wa6a@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "WA6",
      slug: "wa-6",
    });
    const { memberships } = await import("@/db/schema");
    await getTestDb().insert(memberships).values({
      organizationId: org.organizationId,
      userId: agent.id,
      role: "AGENT",
      status: "ACTIVE",
    });
    await expect(
      createWhatsAppInstallation(agent.id, org.organizationId, {
        displayName: "Nope",
        credentials: {
          accessToken: ACCESS,
          appSecret: APP_SECRET,
          verifyToken: VERIFY,
          phoneNumberId: "pn-x",
        },
      }),
    ).rejects.toBeTruthy();
  });
});
