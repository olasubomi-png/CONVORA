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
import { sendPushToUser } from "@/lib/notifications/push";
import { sendNotificationEmail } from "@/lib/notifications/email";
import { getServerEnv } from "@/lib/env";
import { AuthorizationError } from "@/lib/errors";

export type NotifyNewMessageInput = {
  organizationId: string;
  conversationId: string;
  messageId: string;
  customerId: string;
  channel: string;
  preview: string;
  excludeMembershipId?: string | null;
};

type PendingDelivery = {
  notificationId: string;
  userId: string;
  membershipId: string;
  email: string | null;
  pushEnabled: boolean;
  emailEnabled: boolean;
  digestSeconds: number;
  isNewInApp: boolean;
  customerName: string;
  organizationName?: string;
  channel: string;
  preview: string;
  conversationId: string;
  organizationId: string;
  messageId: string;
};

/**
 * Fast path: create/update in-app notification rows only.
 * External channels (push/email) are scheduled asynchronously and never block the caller.
 *
 * Dedup policies (independent per channel):
 * - in-app: unique (membershipId, dedupeKey) where dedupeKey = msg:conversationId:2minBucket
 * - push: once per new in-app row (push_sent_at null → send)
 * - email: at most once per membership+conversation within emailDigestSeconds
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
  const dedupeKey = `msg:${input.conversationId}:${bucket}`;

  let created = 0;
  const pending: PendingDelivery[] = [];

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
            dedupeKey,
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
                eq(agentNotifications.dedupeKey, dedupeKey),
              ),
            )
            .returning();
          notificationId = existing?.id ?? null;
          isNewInApp = false;
        } else {
          throw err;
        }
      }
    } else {
      // Still create a lightweight row for delivery tracking when only push/email
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
            dedupeKey: `${dedupeKey}:ext`,
            readAt: new Date(), // not shown in-app
          })
          .returning();
        notificationId = row?.id ?? null;
        isNewInApp = true;
      } catch (err) {
        if (isUniqueViolation(err)) {
          const [existing] = await db
            .select()
            .from(agentNotifications)
            .where(
              and(
                eq(agentNotifications.membershipId, m.membershipId),
                eq(agentNotifications.dedupeKey, `${dedupeKey}:ext`),
              ),
            )
            .limit(1);
          notificationId = existing?.id ?? null;
          isNewInApp = false;
        } else {
          throw err;
        }
      }
    }

    if (notificationId) {
      pending.push({
        notificationId,
        userId: m.userId,
        membershipId: m.membershipId,
        email: m.email,
        pushEnabled,
        emailEnabled,
        digestSeconds,
        isNewInApp,
        customerName: customer.displayName,
        organizationName: org?.name,
        channel: input.channel,
        preview,
        conversationId: input.conversationId,
        organizationId: input.organizationId,
        messageId: input.messageId,
      });
    }
  }

  // Never await external providers on the request path
  if (pending.length > 0) {
    void deliverExternalChannels(pending).catch(() => undefined);
  }

  return { created };
}

/**
 * Deliver push + email for notification rows. Safe to call multiple times
 * (uses push_sent_at / email_sent_at as idempotency markers).
 */
export async function deliverExternalChannels(
  items: PendingDelivery[],
): Promise<void> {
  const db = getDatabase();
  let appUrl = process.env.APP_URL ?? "http://localhost:3000";
  try {
    appUrl = getServerEnv().APP_URL;
  } catch {
    /* use fallback */
  }

  for (const item of items) {
    const conversationUrl = `${appUrl}/app/inbox?c=${item.conversationId}&org=${item.organizationId}`;

    // Push: only when enabled and not yet sent for this notification row
    if (item.pushEnabled) {
      try {
        const [row] = await db
          .select({
            pushSentAt: agentNotifications.pushSentAt,
          })
          .from(agentNotifications)
          .where(eq(agentNotifications.id, item.notificationId))
          .limit(1);
        if (row && !row.pushSentAt && item.isNewInApp) {
          await sendPushToUser(item.userId, {
            title: item.customerName,
            body: item.preview,
            conversationId: item.conversationId,
            organizationId: item.organizationId,
            url: conversationUrl,
          });
          await db
            .update(agentNotifications)
            .set({ pushSentAt: new Date() })
            .where(
              and(
                eq(agentNotifications.id, item.notificationId),
                sql`${agentNotifications.pushSentAt} IS NULL`,
              ),
            );
        }
      } catch {
        /* push failures never fail messaging */
      }
    }

    // Email digest: one email per membership+conversation per digest window
    if (item.emailEnabled && item.email) {
      try {
        const since = new Date(Date.now() - item.digestSeconds * 1000);
        const [recentEmail] = await db
          .select({ id: agentNotifications.id })
          .from(agentNotifications)
          .where(
            and(
              eq(agentNotifications.membershipId, item.membershipId),
              eq(agentNotifications.conversationId, item.conversationId),
              sql`${agentNotifications.emailSentAt} IS NOT NULL`,
              sql`${agentNotifications.emailSentAt} > ${since}`,
            ),
          )
          .limit(1);

        if (!recentEmail) {
          // Count recent messages in this conversation for digest body
          const [countRow] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(agentNotifications)
            .where(
              and(
                eq(agentNotifications.membershipId, item.membershipId),
                eq(agentNotifications.conversationId, item.conversationId),
                sql`${agentNotifications.createdAt} > ${since}`,
              ),
            );
          const grouped = Math.max(1, countRow?.count ?? 1);

          const ok = await sendNotificationEmail({
            to: item.email,
            customerName: item.customerName,
            organizationName: item.organizationName,
            channel: item.channel,
            preview: item.preview,
            conversationUrl,
            messageCount: grouped,
          });
          if (ok) {
            await db
              .update(agentNotifications)
              .set({ emailSentAt: new Date() })
              .where(
                and(
                  eq(agentNotifications.id, item.notificationId),
                  sql`${agentNotifications.emailSentAt} IS NULL`,
                ),
              );
          }
        }
      } catch {
        /* email failures never fail messaging */
      }
    }
  }
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
        sql`${agentNotifications.dedupeKey} NOT LIKE '%:ext'`,
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
        sql`${agentNotifications.dedupeKey} NOT LIKE '%:ext'`,
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
    emailDigestSeconds: prefs?.emailDigestSeconds ?? 120,
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
    })
    .returning();
  return created;
}
