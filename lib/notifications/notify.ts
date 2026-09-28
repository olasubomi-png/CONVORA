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
 * Create in-app notifications and fan out to push/email per preferences.
 * Deduped per membership + conversation within a short window.
 * Never throws for delivery channel failures.
 */
export async function notifyAgentsOfCustomerMessage(
  input: NotifyNewMessageInput,
) {
  const db = getDatabase();
  const [customer] = await db
    .select({
      displayName: customers.displayName,
      organizationId: customers.organizationId,
      avatarUrl: customers.avatarUrl,
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
      organizationId: memberships.organizationId,
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
  let appUrl = "http://localhost:3000";
  try {
    appUrl = getServerEnv().APP_URL;
  } catch {
    appUrl = process.env.APP_URL ?? appUrl;
  }
  const conversationUrl = `${appUrl}/app/inbox?c=${input.conversationId}`;

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
    let isNew = false;

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
        isNew = true;
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
          isNew = false;
        } else {
          throw err;
        }
      }
    }

    // Push — only on new in-app row or when in-app disabled but push on
    if (pushEnabled && (isNew || !inAppEnabled)) {
      try {
        await sendPushToUser(m.userId, {
          title: customer.displayName,
          body: preview,
          conversationId: input.conversationId,
          organizationId: input.organizationId,
          url: conversationUrl,
        });
        if (notificationId) {
          await db
            .update(agentNotifications)
            .set({ pushSentAt: new Date() })
            .where(eq(agentNotifications.id, notificationId));
        }
      } catch {
        /* ignore */
      }
    }

    // Email with digest cooldown
    if (emailEnabled && m.email) {
      try {
        const since = new Date(Date.now() - digestSeconds * 1000);
        const [recentEmail] = await db
          .select({ id: agentNotifications.id })
          .from(agentNotifications)
          .where(
            and(
              eq(agentNotifications.membershipId, m.membershipId),
              eq(agentNotifications.conversationId, input.conversationId),
              sql`${agentNotifications.emailSentAt} IS NOT NULL`,
              sql`${agentNotifications.emailSentAt} > ${since}`,
            ),
          )
          .limit(1);

        if (!recentEmail) {
          const ok = await sendNotificationEmail({
            to: m.email,
            customerName: customer.displayName,
            organizationName: org?.name,
            channel: input.channel,
            preview,
            conversationUrl,
          });
          if (ok && notificationId) {
            await db
              .update(agentNotifications)
              .set({ emailSentAt: new Date() })
              .where(eq(agentNotifications.id, notificationId));
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  return { created };
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
  if (!m) return { notifications: [], unreadCount: 0 };

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
      customerAvatarUrl: customers.avatarUrl,
    })
    .from(agentNotifications)
    .leftJoin(
      customers,
      eq(customers.id, agentNotifications.customerId),
    )
    .where(eq(agentNotifications.membershipId, m.id))
    .orderBy(sql`${agentNotifications.createdAt} DESC`)
    .limit(Math.min(limit, 100));

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentNotifications)
    .where(
      and(
        eq(agentNotifications.membershipId, m.id),
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
      ),
    )
    .returning();
  return updated ?? null;
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
  if (!m) return { updated: 0 };
  const updated = await db
    .update(agentNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(agentNotifications.membershipId, m.id),
        sql`${agentNotifications.readAt} IS NULL`,
      ),
    )
    .returning({ id: agentNotifications.id });
  return { updated: updated.length };
}
