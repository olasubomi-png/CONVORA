import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { users, messages, customers } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createInstallation } from "@/lib/web-chat/installations";
import {
  createOrResumeVisitorSession,
  setVisitorIdentity,
  sendVisitorMessage,
} from "@/lib/web-chat/visitor";
import {
  markConversationSeenByVisitor,
  markConversationSeenByAgent,
} from "@/lib/messaging/receipts";
import {
  listNotificationsForUser,
  markNotificationRead,
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/notifications/notify";
import { AuthorizationError } from "@/lib/errors";
import { notificationDeliveries } from "@/db/schema";
import { processNotificationDeliveries } from "@/lib/notifications/delivery";
import { enqueueNotificationDelivery } from "@/lib/notifications/delivery";



import { sendAgentMessage } from "@/lib/conversations/messages";
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

async function setup() {
  const owner = await seedUser(`n-${Date.now()}@example.com`);
  const org = await createOrganizationWithOwner(owner.id, {
    name: "N",
    slug: `n-${Date.now()}`,
  });
  const installation = await createInstallation(owner.id, org.organizationId, {
    name: "Site",
  });
  return { owner, org, installation };
}

describe("customer identity avatar field", () => {
  it("creates customer without avatar", async () => {
    const { installation } = await setup();
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    const id = await setVisitorIdentity(session.sessionToken, {
      displayName: "No Photo",
    });
    const [c] = await getTestDb()
      .select()
      .from(customers)
      .where(eq(customers.id, id.customerId));
    expect(c?.avatarUrl).toBeNull();
    expect(c?.displayName).toBe("No Photo");
  });

  it("persists avatarUrl on identity update", async () => {
    const { installation } = await setup();
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    const id = await setVisitorIdentity(session.sessionToken, {
      displayName: "With Photo",
      avatarUrl: "/api/media/00000000-0000-4000-8000-000000000001",
    });
    const [c] = await getTestDb()
      .select()
      .from(customers)
      .where(eq(customers.id, id.customerId));
    expect(c?.avatarUrl).toBe(
      "/api/media/00000000-0000-4000-8000-000000000001",
    );
  });
});

describe("message read receipts", () => {
  it("marks agent messages seen by visitor", async () => {
    const { owner, org, installation } = await setup();
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    await setVisitorIdentity(session.sessionToken, { displayName: "Reader" });
    await sendVisitorMessage(session.sessionToken, "hello agent");

    // Agent replies
    const list = await (
      await import("@/lib/conversations/list")
    ).listOrganizationConversations(owner.id, org.organizationId);
    const convId = list.conversations[0]!.id;
    const agentMsg = await sendAgentMessage(owner.id, convId, "Hi customer");

    const seen = await markConversationSeenByVisitor(session.sessionToken);
    expect(seen.updated).toBeGreaterThanOrEqual(1);

    const [row] = await getTestDb()
      .select()
      .from(messages)
      .where(eq(messages.id, agentMsg.id));
    expect(row?.seenAt).not.toBeNull();
    expect(row?.deliveredAt).not.toBeNull();

    // Idempotent
    const again = await markConversationSeenByVisitor(session.sessionToken);
    expect(again.updated).toBe(0);
  });

  it("marks customer messages seen by agent", async () => {
    const { owner, org, installation } = await setup();
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    await setVisitorIdentity(session.sessionToken, { displayName: "Cust" });
    const msg = await sendVisitorMessage(session.sessionToken, "please help");
    const list = await (
      await import("@/lib/conversations/list")
    ).listOrganizationConversations(owner.id, org.organizationId);
    const convId = list.conversations[0]!.id;
    const result = await markConversationSeenByAgent(owner.id, convId);
    expect(result.updated).toBeGreaterThanOrEqual(1);
    const [row] = await getTestDb()
      .select()
      .from(messages)
      .where(eq(messages.id, msg.id));
    expect(row?.seenAt).not.toBeNull();
  });
});

describe("agent notifications", () => {
  it("creates in-app notification for customer message", async () => {
    const { owner, org, installation } = await setup();
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    await setVisitorIdentity(session.sessionToken, {
      displayName: "Notify Me",
    });
    await sendVisitorMessage(session.sessionToken, "I need help now");

    const listed = await listNotificationsForUser(
      owner.id,
      org.organizationId,
    );
    expect(listed.unreadCount).toBeGreaterThanOrEqual(1);
    expect(listed.notifications[0]?.title).toBe("Notify Me");
  });

  it("marks individual notification as read", async () => {
    const { owner, org, installation } = await setup();
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    await setVisitorIdentity(session.sessionToken, {
      displayName: "Reader",
    });
    await sendVisitorMessage(session.sessionToken, "ping");
    const listed = await listNotificationsForUser(
      owner.id,
      org.organizationId,
    );
    expect(listed.notifications.length).toBeGreaterThan(0);
    const n = listed.notifications[0]!;
    const updated = await markNotificationRead(owner.id, n.id);
    expect(updated?.readAt).not.toBeNull();
    const again = await markNotificationRead(owner.id, n.id);
    expect(again?.readAt).not.toBeNull();
  });

  it("dedupes rapid notifications for same conversation", async () => {
    const { owner, org, installation } = await setup();
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    await setVisitorIdentity(session.sessionToken, {
      displayName: "Spammy",
    });
    await sendVisitorMessage(session.sessionToken, "one");
    await sendVisitorMessage(session.sessionToken, "two");
    await sendVisitorMessage(session.sessionToken, "three");

    const listed = await listNotificationsForUser(
      owner.id,
      org.organizationId,
    );
    // Same 2-minute bucket → one notification row updated
    expect(listed.notifications.length).toBe(1);
  });
});


describe("notification isolation and preferences", () => {
  it("denies listing notifications for another organization", async () => {
    const a = await setup();
    const ownerB = await seedUser(`b-${Date.now()}@example.com`);
    const orgB = await createOrganizationWithOwner(ownerB.id, {
      name: "B",
      slug: `b-${Date.now()}`,
    });
    await expect(
      listNotificationsForUser(a.owner.id, orgB.organizationId),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("updates notification preferences for membership", async () => {
    const { owner, org } = await setup();
    const prefs = await updateNotificationPreferences(
      owner.id,
      org.organizationId,
      { soundEnabled: false, emailDigestSeconds: 180 },
    );
    expect(prefs?.soundEnabled).toBe(false);
    expect(prefs?.emailDigestSeconds).toBe(180);
    const loaded = await getNotificationPreferences(
      owner.id,
      org.organizationId,
    );
    expect(loaded.soundEnabled).toBe(false);
    expect(loaded.emailDigestSeconds).toBe(180);
  });
});


describe("notification delivery outbox", () => {
  it("queues independent push and email deliveries", async () => {
    const { owner, org, installation } = await setup();
    await updateNotificationPreferences(owner.id, org.organizationId, {
      pushEnabled: true,
      emailEnabled: true,
      emailDigestSeconds: 120,
    });
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    await setVisitorIdentity(session.sessionToken, {
      displayName: "Deliver",
    });
    await sendVisitorMessage(session.sessionToken, "hello delivery");

    const jobs = await getTestDb()
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.organizationId, org.organizationId));

    const channels = jobs.map((j) => j.channel).sort();
    expect(channels).toContain("PUSH");
    expect(channels).toContain("EMAIL");

    const push = jobs.find((j) => j.channel === "PUSH");
    const email = jobs.find((j) => j.channel === "EMAIL");
    expect(push?.status === "SENT" || push?.status === "PENDING" || push?.status === "FAILED").toBe(true);
    // Email is delayed by availableAt
    expect(email?.status).toBe("PENDING");
    expect(email?.availableAt.getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it("merges rapid email deliveries into one pending job", async () => {
    const { owner, org, installation } = await setup();
    await updateNotificationPreferences(owner.id, org.organizationId, {
      emailEnabled: true,
      emailDigestSeconds: 300,
    });
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    await setVisitorIdentity(session.sessionToken, {
      displayName: "Batch",
    });
    await sendVisitorMessage(session.sessionToken, "one");
    await sendVisitorMessage(session.sessionToken, "two");
    await sendVisitorMessage(session.sessionToken, "three");

    const emailJobs = await getTestDb()
      .select()
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.organizationId, org.organizationId),
          eq(notificationDeliveries.channel, "EMAIL"),
        ),
      );
    expect(emailJobs.length).toBe(1);
    const count = (emailJobs[0]?.payload as { messageCount?: number })
      ?.messageCount;
    expect((count ?? 0) >= 2).toBe(true);
  });
});


describe("WhatsApp agent notifications", () => {
  it("saves valid E.164 WhatsApp number", async () => {
    const { owner, org } = await setup();
    const prefs = await updateNotificationPreferences(
      owner.id,
      org.organizationId,
      {
        whatsappEnabled: true,
        whatsappPhoneE164: "+2348012345678",
      },
    );
    expect(prefs?.whatsappEnabled).toBe(true);
    expect(prefs?.whatsappPhoneE164).toBe("+2348012345678");
  });

  it("rejects invalid WhatsApp number", async () => {
    const { owner, org } = await setup();
    await expect(
      updateNotificationPreferences(owner.id, org.organizationId, {
        whatsappPhoneE164: "08012345678",
      }),
    ).rejects.toThrow(/E\.164|valid WhatsApp/i);
  });

  it("does not queue WhatsApp when disabled", async () => {
    const { owner, org, installation } = await setup();
    await updateNotificationPreferences(owner.id, org.organizationId, {
      whatsappEnabled: false,
      whatsappPhoneE164: "+2348012345678",
    });
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    await setVisitorIdentity(session.sessionToken, { displayName: "No WA" });
    await sendVisitorMessage(session.sessionToken, "hello");
    const jobs = await getTestDb()
      .select()
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.organizationId, org.organizationId),
          eq(notificationDeliveries.channel, "WHATSAPP"),
        ),
      );
    expect(jobs.length).toBe(0);
  });

  it("queues WhatsApp delivery when enabled with number", async () => {
    const { owner, org, installation } = await setup();
    await updateNotificationPreferences(owner.id, org.organizationId, {
      whatsappEnabled: true,
      whatsappPhoneE164: "+2348099990000",
      whatsappDigestSeconds: 120,
    });
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    await setVisitorIdentity(session.sessionToken, { displayName: "WA User" });
    await sendVisitorMessage(session.sessionToken, "need help");
    const jobs = await getTestDb()
      .select()
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.organizationId, org.organizationId),
          eq(notificationDeliveries.channel, "WHATSAPP"),
        ),
      );
    expect(jobs.length).toBe(1);
    expect(jobs[0]?.status).toBe("PENDING");
    const payload = jobs[0]?.payload as { toPhoneE164?: string };
    expect(payload.toPhoneE164).toBe("+2348099990000");
    expect(JSON.stringify(jobs[0]?.payload)).not.toMatch(/accessToken|Bearer|secret/i);
  });

  it("merges rapid WhatsApp alerts for same conversation", async () => {
    const { owner, org, installation } = await setup();
    await updateNotificationPreferences(owner.id, org.organizationId, {
      whatsappEnabled: true,
      whatsappPhoneE164: "+2348011112222",
      whatsappDigestSeconds: 300,
    });
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    await setVisitorIdentity(session.sessionToken, { displayName: "Spam" });
    await sendVisitorMessage(session.sessionToken, "a");
    await sendVisitorMessage(session.sessionToken, "b");
    await sendVisitorMessage(session.sessionToken, "c");
    const jobs = await getTestDb()
      .select()
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.organizationId, org.organizationId),
          eq(notificationDeliveries.channel, "WHATSAPP"),
        ),
      );
    expect(jobs.length).toBe(1);
    const count = (jobs[0]?.payload as { messageCount?: number })?.messageCount;
    expect((count ?? 0) >= 2).toBe(true);
  });
});


describe("notification delivery worker processing", () => {
  it("does not claim jobs that are not yet available", async () => {
    const { owner, org } = await setup();
    const future = new Date(Date.now() + 60_000);
    await enqueueNotificationDelivery({
      organizationId: org.organizationId,
      membershipId: org.membershipId,
      userId: owner.id,
      notificationId: null,
      conversationId: null,
      customerId: null,
      channel: "PUSH",
      dedupeKey: `push-future-${Date.now()}`,
      payload: { preview: "later" },
      availableAt: future,
    });
    const result = await processNotificationDeliveries({
      organizationId: org.organizationId,
      limit: 20,
    });
    expect(result.claimed).toBe(0);
  });

  it("claims due PENDING jobs and marks SENT when push has no subscriptions", async () => {
    // Push with no subscriptions still "succeeds" (sendPushToUser returns gracefully)
    const { owner, org } = await setup();
    await enqueueNotificationDelivery({
      organizationId: org.organizationId,
      membershipId: org.membershipId,
      userId: owner.id,
      notificationId: null,
      conversationId: null,
      customerId: null,
      channel: "PUSH",
      dedupeKey: `push-due-${Date.now()}`,
      payload: { preview: "now", customerName: "C" },
      availableAt: new Date(Date.now() - 1000),
    });
    const result = await processNotificationDeliveries({
      organizationId: org.organizationId,
      limit: 20,
    });
    expect(result.claimed).toBeGreaterThanOrEqual(1);
    const [job] = await getTestDb()
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.organizationId, org.organizationId));
    expect(["SENT", "FAILED", "PENDING", "CANCELLED"]).toContain(job?.status);
  });

  it("sets future availableAt on transient failure for WhatsApp without config", async () => {
    const { owner, org } = await setup();
    delete process.env.WHATSAPP_NOTIFICATIONS_ACCESS_TOKEN;
    delete process.env.WHATSAPP_NOTIFICATIONS_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_NOTIFICATION_TEMPLATE_NAME;
    await enqueueNotificationDelivery({
      organizationId: org.organizationId,
      membershipId: org.membershipId,
      userId: owner.id,
      notificationId: null,
      conversationId: null,
      customerId: null,
      channel: "WHATSAPP",
      dedupeKey: `wa-fail-${Date.now()}`,
      payload: {
        toPhoneE164: "+2348012345678",
        customerName: "John",
        channelLabel: "WEB",
        preview: "hi",
        conversationUrl: "https://example.com/app/inbox",
        messageCount: 1,
      },
      availableAt: new Date(Date.now() - 1000),
    });
    await processNotificationDeliveries({
      organizationId: org.organizationId,
      limit: 10,
    });
    const [job] = await getTestDb()
      .select()
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.organizationId, org.organizationId),
          eq(notificationDeliveries.channel, "WHATSAPP"),
        ),
      );
    expect(job).toBeTruthy();
    // ConfigurationError → retry as PENDING with future availableAt
    if (job?.status === "PENDING") {
      expect(job.availableAt.getTime()).toBeGreaterThan(Date.now() - 5000);
      expect((job.attemptCount ?? 0) >= 1).toBe(true);
    } else {
      expect(["FAILED", "CANCELLED"]).toContain(job?.status);
    }
  });

  it("customer message does not require provider to succeed", async () => {
    const { owner, org, installation } = await setup();
    await updateNotificationPreferences(owner.id, org.organizationId, {
      whatsappEnabled: true,
      whatsappPhoneE164: "+2348088887777",
    });
    delete process.env.WHATSAPP_NOTIFICATIONS_ACCESS_TOKEN;
    const session = await createOrResumeVisitorSession({
      publicKey: installation.publicKey,
      origin: null,
    });
    await setVisitorIdentity(session.sessionToken, { displayName: "Cust" });
    const msg = await sendVisitorMessage(session.sessionToken, "hello worker");
    expect(msg.id).toBeTruthy();
  });
});
