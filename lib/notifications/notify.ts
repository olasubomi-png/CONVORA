import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  agentNotifications,
  notificationPreferences,
  memberships,
  customers,
  users,
  organizations,
} from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import { getServerEnv } from "@/lib/env";
import { AuthorizationError } from "@/lib/errors";
import {
  enqueueNotificationDelivery,
  processNotificationDeliveries,
} from "@/lib/notifications/delivery";

export type NotifyNewMessageInput = {
  organizationId: string;
  conversationId: string;
  messageId: string;
  customerId: string;
  channel: string;
  preview: string;
  excludeMembershipId?: string | null;
};

/**
 * Create in-app notifications and enqueue durable PUSH/EMAIL delivery jobs.
 * Does not call external providers on the request path.
 * Call processNotificationDeliveries() after commit (via flush) to process due jobs.
 *
 * Channel policies (independent):
 * - in-app: unique (membershipId, dedupeKey) 2-minute conversation bucket
 * - push: dedupeKey push:conversationId:2minBucket — immediate availableAt
 * - email: dedupeKey email:conversationId:digestBucket — availableAt delayed by emailDigestSeconds
 */
export async function notifyAgentsOfCustomerMessage(
  input: NotifyNewMessageInput,
): Promise<{ created: number }> {
  const db = getDatabase();
  const [customer] = await db
    .select({
      displayName: customers.displayName,
      organizationId: customers.organizationId,
    })
    .from(customers)
    .where(eq(customers.id, input.customerId))
    .limit(1);
  if (!customer || customer.organizationId !== input.organizationId) {
    return { created: 0 };
  }

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);

  const members = await db
    .select({
      membershipId: memberships.id,
      userId: memberships.userId,
      email: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(
      and(
        eq(memberships.organizationId, input.organizationId),
        eq(memberships.status, "ACTIVE"),
      ),
    );

  const preview = input.preview.trim().slice(0, 140) || "New message";
  const bucket = Math.floor(Date.now() / 120_000);
  const inAppDedupeKey = `msg:${input.conversationId}:${bucket}`;

  let appUrl = process.env.APP_URL ?? "http://localhost:3000";
  try {
    appUrl = getServerEnv().APP_URL;
  } catch {
    /* fallback */
  }
  const conversationUrl = `${appUrl}/app/inbox?c=${input.conversationId}&org=${input.organizationId}`;

  let created = 0;

  for (const m of members) {
    if (
      input.excludeMembershipId &&
      m.membershipId === input.excludeMembershipId
    ) {
      continue;
    }

    const [prefs] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.membershipId, m.membershipId))
      .limit(1);

    const inAppEnabled = prefs?.inAppEnabled !== false;
    const pushEnabled = prefs?.pushEnabled !== false;
    const emailEnabled = prefs?.emailEnabled !== false;
    const digestSeconds = prefs?.emailDigestSeconds ?? 120;

    if (!inAppEnabled && !pushEnabled && !emailEnabled) continue;

    let notificationId: string | null = null;
    let isNewInApp = false;

    if (inAppEnabled) {
      try {
        const [row] = await db
          .insert(agentNotifications)
          .values({
            organizationId: input.organizationId,
            membershipId: m.membershipId,
            userId: m.userId,
            type: "conversation.message_received",
            title: customer.displayName,
            body: preview,
            conversationId: input.conversationId,
            messageId: input.messageId,
            customerId: input.customerId,
            channel: input.channel,
            dedupeKey: inAppDedupeKey,
          })
          .returning();
        notificationId = row?.id ?? null;
        isNewInApp = true;
        created += 1;
      } catch (err) {
        if (isUniqueViolation(err)) {
          const [existing] = await db
            .update(agentNotifications)
            .set({
              body: preview,
              messageId: input.messageId,
              title: customer.displayName,
            })
            .where(
              and(
                eq(agentNotifications.membershipId, m.membershipId),
                eq(agentNotifications.dedupeKey, inAppDedupeKey),
              ),
            )
            .returning();
          notificationId = existing?.id ?? null;
          isNewInApp = false;
        } else {
          throw err;
        }
      }
    }

    const basePayload = {
      customerName: customer.displayName,
      organizationName: org?.name,
      channelLabel: input.channel,
      preview,
      conversationUrl,
      messageCount: 1,
      messageId: input.messageId,
    };

    // PUSH — independent dedupe; only queue on new in-app or when in-app off
    if (pushEnabled && (isNewInApp || !inAppEnabled)) {
      await enqueueNotificationDelivery({
        organizationId: input.organizationId,
        membershipId: m.membershipId,
        userId: m.userId,
        notificationId,
        conversationId: input.conversationId,
        customerId: input.customerId,
        channel: "PUSH",
        dedupeKey: `push:${input.conversationId}:${bucket}`,
        payload: basePayload,
        availableAt: new Date(),
      });
    }

    // EMAIL — delayed cooldown window (emailDigestSeconds). Same dedupe key merges
    // subsequent messages into one PENDING job until availableAt.
    if (emailEnabled && m.email) {
      const emailBucket = Math.floor(Date.now() / (digestSeconds * 1000));
      const emailDedupe = `email:${input.conversationId}:${emailBucket}`;
      const availableAt = new Date(Date.now() + digestSeconds * 1000);
      await enqueueNotificationDelivery({
        organizationId: input.organizationId,
        membershipId: m.membershipId,
        userId: m.userId,
        notificationId,
        conversationId: input.conversationId,
        customerId: input.customerId,
        channel: "EMAIL",
        dedupeKey: emailDedupe,
        payload: basePayload,
        availableAt,
      });
    }

    // WHATSAPP — independent cooldown; recipient from preference (no secrets in payload)
    const whatsappEnabled = prefs?.whatsappEnabled === true;
    const whatsappPhone = prefs?.whatsappPhoneE164?.trim() || null;
    const whatsappDigest = prefs?.whatsappDigestSeconds ?? 120;
    if (whatsappEnabled && whatsappPhone) {
      const waBucket = Math.floor(Date.now() / (whatsappDigest * 1000));
      const waDedupe = `whatsapp:${input.conversationId}:${waBucket}`;
      const waAvailableAt = new Date(Date.now() + whatsappDigest * 1000);
      await enqueueNotificationDelivery({
        organizationId: input.organizationId,
        membershipId: m.membershipId,
        userId: m.userId,
        notificationId,
        conversationId: input.conversationId,
        customerId: input.customerId,
        channel: "WHATSAPP",
        dedupeKey: waDedupe,
        payload: {
          ...basePayload,
          toPhoneE164: whatsappPhone,
        },
        availableAt: waAvailableAt,
      });
    }
  }

  return { created };
}

/**
 * Process due notification delivery jobs for an organization.
 * Intended to run after domain mutations (alongside automation flush).
 */
export async function flushNotificationDeliveries(
  organizationId: string,
): Promise<void> {
  await processNotificationDeliveries({ organizationId, limit: 50 });
}

export async function listNotificationsForUser(
  userId: string,
  organizationId: string,
  limit = 30,
) {
  const db = getDatabase();
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.organizationId, organizationId),
        eq(memberships.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!m) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }

  const rows = await db
    .select({
      id: agentNotifications.id,
      type: agentNotifications.type,
      title: agentNotifications.title,
      body: agentNotifications.body,
      conversationId: agentNotifications.conversationId,
      messageId: agentNotifications.messageId,
      customerId: agentNotifications.customerId,
      channel: agentNotifications.channel,
      readAt: agentNotifications.readAt,
      createdAt: agentNotifications.createdAt,
      organizationId: agentNotifications.organizationId,
      customerAvatarUrl: customers.avatarUrl,
    })
    .from(agentNotifications)
    .leftJoin(customers, eq(customers.id, agentNotifications.customerId))
    .where(
      and(
        eq(agentNotifications.membershipId, m.id),
        eq(agentNotifications.organizationId, organizationId),
      ),
    )
    .orderBy(sql`${agentNotifications.createdAt} DESC`)
    .limit(Math.min(limit, 100));

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentNotifications)
    .where(
      and(
        eq(agentNotifications.membershipId, m.id),
        eq(agentNotifications.organizationId, organizationId),
        sql`${agentNotifications.readAt} IS NULL`,
      ),
    );

  return {
    notifications: rows,
    unreadCount: countRow?.count ?? 0,
  };
}

export async function markNotificationRead(
  userId: string,
  notificationId: string,
) {
  const db = getDatabase();
  const [row] = await db
    .select()
    .from(agentNotifications)
    .where(eq(agentNotifications.id, notificationId))
    .limit(1);
  if (!row || row.userId !== userId) return null;
  if (row.readAt) return row;
  const [updated] = await db
    .update(agentNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(agentNotifications.id, notificationId),
        eq(agentNotifications.userId, userId),
        sql`${agentNotifications.readAt} IS NULL`,
      ),
    )
    .returning();
  return updated ?? row;
}

export async function markAllNotificationsRead(
  userId: string,
  organizationId: string,
) {
  const db = getDatabase();
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.organizationId, organizationId),
        eq(memberships.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!m) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }
  const updated = await db
    .update(agentNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(agentNotifications.membershipId, m.id),
        eq(agentNotifications.organizationId, organizationId),
        sql`${agentNotifications.readAt} IS NULL`,
      ),
    )
    .returning({ id: agentNotifications.id });
  return { updated: updated.length };
}

export async function getNotificationPreferences(
  userId: string,
  organizationId: string,
) {
  const db = getDatabase();
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.organizationId, organizationId),
        eq(memberships.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!m) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }
  const [prefs] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.membershipId, m.id))
    .limit(1);
  return {
    membershipId: m.id,
    organizationId,
    inAppEnabled: prefs?.inAppEnabled ?? true,
    emailEnabled: prefs?.emailEnabled ?? true,
    pushEnabled: prefs?.pushEnabled ?? true,
    soundEnabled: prefs?.soundEnabled ?? true,
    /** Cooldown before another email for the same conversation (seconds). */
    emailDigestSeconds: prefs?.emailDigestSeconds ?? 120,
    whatsappEnabled: prefs?.whatsappEnabled ?? false,
    whatsappPhoneE164: prefs?.whatsappPhoneE164 ?? null,
    whatsappDigestSeconds: prefs?.whatsappDigestSeconds ?? 120,
  };
}

export async function updateNotificationPreferences(
  userId: string,
  organizationId: string,
  input: {
    inAppEnabled?: boolean;
    emailEnabled?: boolean;
    pushEnabled?: boolean;
    soundEnabled?: boolean;
    emailDigestSeconds?: number;
    whatsappEnabled?: boolean;
    whatsappPhoneE164?: string | null;
    whatsappDigestSeconds?: number;
  },
) {
  const db = getDatabase();
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.organizationId, organizationId),
        eq(memberships.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!m) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }

  const digest =
    input.emailDigestSeconds !== undefined
      ? Math.min(3600, Math.max(30, Math.floor(input.emailDigestSeconds)))
      : undefined;
  const waDigest =
    input.whatsappDigestSeconds !== undefined
      ? Math.min(3600, Math.max(30, Math.floor(input.whatsappDigestSeconds)))
      : undefined;

  let whatsappPhone: string | null | undefined = undefined;
  if (input.whatsappPhoneE164 !== undefined) {
    if (input.whatsappPhoneE164 === null || input.whatsappPhoneE164.trim() === "") {
      whatsappPhone = null;
    } else {
      const { normalizeE164Phone } = await import("@/lib/notifications/whatsapp");
      whatsappPhone = normalizeE164Phone(input.whatsappPhoneE164);
    }
  }

  const [existing] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.membershipId, m.id))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(notificationPreferences)
      .set({
        ...(input.inAppEnabled !== undefined
          ? { inAppEnabled: input.inAppEnabled }
          : {}),
        ...(input.emailEnabled !== undefined
          ? { emailEnabled: input.emailEnabled }
          : {}),
        ...(input.pushEnabled !== undefined
          ? { pushEnabled: input.pushEnabled }
          : {}),
        ...(input.soundEnabled !== undefined
          ? { soundEnabled: input.soundEnabled }
          : {}),
        ...(digest !== undefined ? { emailDigestSeconds: digest } : {}),
        ...(input.whatsappEnabled !== undefined
          ? { whatsappEnabled: input.whatsappEnabled }
          : {}),
        ...(whatsappPhone !== undefined
          ? { whatsappPhoneE164: whatsappPhone }
          : {}),
        ...(waDigest !== undefined ? { whatsappDigestSeconds: waDigest } : {}),
        updatedAt: new Date(),
      })
      .where(eq(notificationPreferences.membershipId, m.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(notificationPreferences)
    .values({
      membershipId: m.id,
      organizationId,
      inAppEnabled: input.inAppEnabled ?? true,
      emailEnabled: input.emailEnabled ?? true,
      pushEnabled: input.pushEnabled ?? true,
      soundEnabled: input.soundEnabled ?? true,
      emailDigestSeconds: digest ?? 120,
      whatsappEnabled: input.whatsappEnabled ?? false,
      whatsappPhoneE164: whatsappPhone ?? null,
      whatsappDigestSeconds: waDigest ?? 120,
    })
    .returning();
  return created;
}
