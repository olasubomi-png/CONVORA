import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  agentNotifications,
  notificationPreferences,
  memberships,
  customers,
} from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";

export type NotifyNewMessageInput = {
  organizationId: string;
  conversationId: string;
  messageId: string;
  customerId: string;
  channel: string;
  preview: string;
  /** When set, skip notifying this membership (active viewer). */
  excludeMembershipId?: string | null;
};

/**
 * Create in-app notifications for active org members about a new customer message.
 * Deduped per membership + conversation within a short window via dedupe_key.
 */
export async function notifyAgentsOfCustomerMessage(
  input: NotifyNewMessageInput,
) {
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

  const members = await db
    .select({
      membershipId: memberships.id,
      userId: memberships.userId,
      organizationId: memberships.organizationId,
    })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, input.organizationId),
        eq(memberships.status, "ACTIVE"),
      ),
    );

  const preview =
    input.preview.trim().slice(0, 140) || "New message";
  // Dedupe window: same conversation within ~2 minutes shares key bucket
  const bucket = Math.floor(Date.now() / (120_000));
  const dedupeKey = `msg:${input.conversationId}:${bucket}`;

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
    if (prefs && !prefs.inAppEnabled) continue;

    try {
      await db.insert(agentNotifications).values({
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
      });
      created += 1;
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Refresh body on existing deduped notification
        await db
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
          );
        continue;
      }
      throw err;
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
    .select()
    .from(agentNotifications)
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
    .where(eq(agentNotifications.id, notificationId))
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
