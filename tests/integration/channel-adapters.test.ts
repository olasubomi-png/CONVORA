import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  users,
  messages,
  conversations,
  customers,
  channelInboundEvents,
  channelMessageDeliveries,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createChannelInstallation } from "@/lib/channels/installations";
import { processInboundEvent } from "@/lib/channels/inbound";
import { deliverOutboundMessage } from "@/lib/channels/delivery";
import {
  registerChannelAdapter,
  resetChannelAdapterRegistry,
} from "@/lib/channels/registry";
import { MockChannelAdapter } from "@/lib/channels/adapters/mock";
import { sendAgentMessage } from "@/lib/conversations/messages";
import {
  AuthorizationError,
} from "@/lib/errors";
import { getTestDb, setupTestEnv, truncateAllTables } from "../helpers/db";

beforeAll(() => {
  setupTestEnv();
});

beforeEach(async () => {
  await truncateAllTables();
  resetChannelAdapterRegistry();
  registerChannelAdapter(
    new MockChannelAdapter({ channel: "WHATSAPP", provider: "mock" }),
  );
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

describe("channel adapter foundation", () => {
  it("inbound creates customer, conversation, message", async () => {
    const owner = await seedUser("ch1@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "CH",
      slug: "ch-1",
    });
    const installation = await createChannelInstallation(
      owner.id,
      org.organizationId,
      {
        channel: "WHATSAPP",
        provider: "mock",
        displayName: "WA",
      },
    );

    const body = JSON.stringify({
      eventId: "evt-1",
      messageId: "pm-1",
      externalUserId: "wa-user-1",
      username: "Alice",
      text: "Hello from WhatsApp",
    });

    const result = await processInboundEvent({
      installationId: installation.id,
      headers: { "x-mock-signature": "mock-webhook-secret" },
      body,
    });

    expect(result.processed).toBe(1);
    const cust = await getTestDb()
      .select()
      .from(customers)
      .where(eq(customers.organizationId, org.organizationId));
    expect(cust).toHaveLength(1);
    const conv = await getTestDb()
      .select()
      .from(conversations)
      .where(eq(conversations.organizationId, org.organizationId));
    expect(conv).toHaveLength(1);
    expect(conv[0]?.channel).toBe("WHATSAPP");
    const msgs = await getTestDb().select().from(messages);
    expect(msgs.some((m) => m.body === "Hello from WhatsApp")).toBe(true);
  });

  it("duplicate webhook is idempotent", async () => {
    const owner = await seedUser("ch2@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "CH2",
      slug: "ch-2",
    });
    const installation = await createChannelInstallation(
      owner.id,
      org.organizationId,
      { channel: "WHATSAPP", provider: "mock", displayName: "WA" },
    );
    const body = JSON.stringify({
      eventId: "evt-dup",
      messageId: "pm-dup",
      externalUserId: "wa-2",
      text: "once",
    });
    const headers = { "x-mock-signature": "mock-webhook-secret" };
    await processInboundEvent({
      installationId: installation.id,
      headers,
      body,
    });
    const b = await processInboundEvent({
      installationId: installation.id,
      headers,
      body,
    });
    expect(b.results[0]?.duplicate).toBe(true);
    const msgs = await getTestDb().select().from(messages);
    expect(msgs).toHaveLength(1);
    const events = await getTestDb().select().from(channelInboundEvents);
    expect(events).toHaveLength(1);
  });

  it("rejects invalid webhook signature", async () => {
    const owner = await seedUser("ch3@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "CH3",
      slug: "ch-3",
    });
    const installation = await createChannelInstallation(
      owner.id,
      org.organizationId,
      { channel: "WHATSAPP", provider: "mock", displayName: "WA" },
    );
    await expect(
      processInboundEvent({
        installationId: installation.id,
        headers: { "x-mock-signature": "wrong" },
        body: JSON.stringify({
          eventId: "e",
          messageId: "m",
          externalUserId: "u",
          text: "x",
        }),
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("outbound delivery is idempotent per message", async () => {
    const owner = await seedUser("ch4@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "CH4",
      slug: "ch-4",
    });
    const installation = await createChannelInstallation(
      owner.id,
      org.organizationId,
      { channel: "WHATSAPP", provider: "mock", displayName: "WA" },
    );
    const body = JSON.stringify({
      eventId: "evt-out",
      messageId: "pm-out",
      externalUserId: "wa-out",
      text: "hi",
    });
    await processInboundEvent({
      installationId: installation.id,
      headers: { "x-mock-signature": "mock-webhook-secret" },
      body,
    });
    const [conv] = await getTestDb()
      .select()
      .from(conversations)
      .where(eq(conversations.organizationId, org.organizationId));
    const agentMsg = await sendAgentMessage(owner.id, conv!.id, "Reply");
    const d1 = await deliverOutboundMessage({
      organizationId: org.organizationId,
      conversationId: conv!.id,
      messageId: agentMsg.id,
    });
    const d2 = await deliverOutboundMessage({
      organizationId: org.organizationId,
      conversationId: conv!.id,
      messageId: agentMsg.id,
    });
    expect("delivered" in d1 && d1.delivered).toBe(true);
    expect("duplicate" in d2 || "skipped" in d2).toBe(true);
    const deliveries = await getTestDb().select().from(channelMessageDeliveries);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe("SENT");
  });

  it("agent cannot create channel installation", async () => {
    const owner = await seedUser("ch5o@example.com");
    const agent = await seedUser("ch5a@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "CH5",
      slug: "ch-5",
    });
    // invite agent - use membership insert if invite is complex
    const { memberships } = await import("@/db/schema");
    await getTestDb().insert(memberships).values({
      organizationId: org.organizationId,
      userId: agent.id,
      role: "AGENT",
      status: "ACTIVE",
    });
    await expect(
      createChannelInstallation(agent.id, org.organizationId, {
        channel: "WHATSAPP",
        provider: "mock",
        displayName: "Nope",
      }),
    ).rejects.toBeTruthy();
  });

  it("secrets are not returned from create", async () => {
    const owner = await seedUser("ch6@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "CH6",
      slug: "ch-6",
    });
    const installation = await createChannelInstallation(
      owner.id,
      org.organizationId,
      {
        channel: "WHATSAPP",
        provider: "mock",
        displayName: "Secret",
        encryptedConfig: { token: "super-secret" },
      },
    );
    expect(
      (installation as { encryptedConfig?: unknown }).encryptedConfig,
    ).toBeUndefined();
  });
});
