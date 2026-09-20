import { createHmac } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  users,
  messages,
  conversations,
  customers,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createWhatsAppInstallation } from "@/lib/channels/providers/whatsapp/installations";
import { processInboundEvent } from "@/lib/channels/inbound";
import { WhatsAppCloudAdapter } from "@/lib/channels/providers/whatsapp/adapter";
import { loadWhatsAppCredentials } from "@/lib/channels/providers/whatsapp/installations";
import { AuthorizationError } from "@/lib/errors";
import { getTestDb, setupTestEnv, truncateAllTables } from "../helpers/db";
import { getDatabase } from "@/db";
import { channelInstallations } from "@/db/schema";
import { resetChannelAdapterRegistry } from "@/lib/channels/registry";

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

function textPayload(opts: {
  eventId: string;
  from: string;
  text: string;
  phoneNumberId: string;
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
              metadata: { phone_number_id: opts.phoneNumberId },
              contacts: [{ wa_id: opts.from, profile: { name: "User" } }],
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

async function setupOrg(opts: {
  email: string;
  slug: string;
  secret: string;
  phone: string;
  access: string;
}) {
  const owner = await seedUser(opts.email);
  const org = await createOrganizationWithOwner(owner.id, {
    name: opts.email,
    slug: opts.slug,
  });
  const installation = await createWhatsAppInstallation(
    owner.id,
    org.organizationId,
    {
      displayName: opts.slug,
      credentials: {
        accessToken: opts.access,
        appSecret: opts.secret,
        verifyToken: `verify-${opts.slug}`,
        phoneNumberId: opts.phone,
      },
    },
  );
  const full = (
    await getDatabase()
      .select()
      .from(channelInstallations)
      .where(eq(channelInstallations.id, installation.id))
  )[0]!;
  const adapter = new WhatsAppCloudAdapter(loadWhatsAppCredentials(full));
  return { owner, org, installation, adapter, secret: opts.secret };
}

describe("WhatsApp credential isolation", () => {
  it("concurrent webhooks from two orgs use correct credentials", async () => {
    const a = await setupOrg({
      email: "hard-a@example.com",
      slug: "hard-a",
      secret: "SECRET_A_VALUE_XXXX",
      phone: "PHONE_A",
      access: "TOKEN_A_ACCESS_TOKEN_XX",
    });
    const b = await setupOrg({
      email: "hard-b@example.com",
      slug: "hard-b",
      secret: "SECRET_B_VALUE_YYYY",
      phone: "PHONE_B",
      access: "TOKEN_B_ACCESS_TOKEN_YY",
    });

    const bodyA = textPayload({
      eventId: "wamid.a.1",
      from: "1111111111",
      text: "from A",
      phoneNumberId: "PHONE_A",
    });
    const bodyB = textPayload({
      eventId: "wamid.b.1",
      from: "2222222222",
      text: "from B",
      phoneNumberId: "PHONE_B",
    });

    const results = await Promise.all([
      processInboundEvent({
        installationId: a.installation.id,
        adapter: a.adapter,
        headers: { "x-hub-signature-256": sign(bodyA, a.secret) },
        body: bodyA,
      }),
      processInboundEvent({
        installationId: b.installation.id,
        adapter: b.adapter,
        headers: { "x-hub-signature-256": sign(bodyB, b.secret) },
        body: bodyB,
      }),
    ]);

    expect(results[0].processed).toBe(1);
    expect(results[1].processed).toBe(1);

    const custA = await getTestDb()
      .select()
      .from(customers)
      .where(eq(customers.organizationId, a.org.organizationId));
    const custB = await getTestDb()
      .select()
      .from(customers)
      .where(eq(customers.organizationId, b.org.organizationId));
    expect(custA).toHaveLength(1);
    expect(custB).toHaveLength(1);

    const convA = await getTestDb()
      .select()
      .from(conversations)
      .where(eq(conversations.organizationId, a.org.organizationId));
    const convB = await getTestDb()
      .select()
      .from(conversations)
      .where(eq(conversations.organizationId, b.org.organizationId));
    expect(convA).toHaveLength(1);
    expect(convB).toHaveLength(1);

    const msgs = await getTestDb().select().from(messages);
    expect(msgs.filter((m) => m.body === "from A")).toHaveLength(1);
    expect(msgs.filter((m) => m.body === "from B")).toHaveLength(1);
  });

  it("rejects event signed with another org secret", async () => {
    const a = await setupOrg({
      email: "cross-a@example.com",
      slug: "cross-a",
      secret: "SECRET_A_ONLY",
      phone: "PHONE_CA",
      access: "TOKEN_CA_XXXXXXXXXXXX",
    });
    const b = await setupOrg({
      email: "cross-b@example.com",
      slug: "cross-b",
      secret: "SECRET_B_ONLY",
      phone: "PHONE_CB",
      access: "TOKEN_CB_XXXXXXXXXXXX",
    });

    const bodyA = textPayload({
      eventId: "wamid.cross",
      from: "3333333333",
      text: "cross",
      phoneNumberId: "PHONE_CA",
    });

    await expect(
      processInboundEvent({
        installationId: a.installation.id,
        adapter: a.adapter,
        headers: { "x-hub-signature-256": sign(bodyA, b.secret) },
        body: bodyA,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    await expect(
      processInboundEvent({
        installationId: b.installation.id,
        adapter: b.adapter,
        headers: { "x-hub-signature-256": sign(bodyA, a.secret) },
        body: bodyA,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("stores providerResourceId for indexed lookup", async () => {
    const a = await setupOrg({
      email: "idx@example.com",
      slug: "idx-wa",
      secret: "SECRET_IDX",
      phone: "PHONE_IDX",
      access: "TOKEN_IDX_XXXXXXXXXXXX",
    });
    const [row] = await getDatabase()
      .select()
      .from(channelInstallations)
      .where(eq(channelInstallations.id, a.installation.id));
    expect(row?.providerResourceId).toBe("PHONE_IDX");
  });
});
