import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import { notificationDeliveries } from "@/db/schema";
import type { NotificationDeliveryPayload } from "@/db/schema";
import { sendPushToUser } from "@/lib/notifications/push";
import { sendNotificationEmail } from "@/lib/notifications/email";
import { isUniqueViolation } from "@/lib/db-errors";

const MAX_ATTEMPTS = 5;

/** Exponential-ish backoff after a failed attempt (seconds). */
function backoffSeconds(attemptCount: number): number {
  const table = [0, 30, 120, 600, 1800];
  return table[Math.min(attemptCount, table.length - 1)] ?? 1800;
}


const claimedIdSchema = z.object({ id: z.string().uuid() });

function parseClaimedIds(result: unknown): string[] {
  let rows: unknown[] = [];
  if (Array.isArray(result)) {
    rows = result;
  } else if (
    result !== null &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows: unknown }).rows)
  ) {
    rows = (result as { rows: unknown[] }).rows;
  }
  const ids: string[] = [];
  for (const row of rows) {
    const parsed = claimedIdSchema.safeParse(row);
    if (parsed.success) ids.push(parsed.data.id);
  }
  return ids;
}

export type EnqueueDeliveryInput = {
  organizationId: string;
  membershipId: string;
  userId: string;
  notificationId: string | null;
  conversationId: string | null;
  customerId: string | null;
  channel: "PUSH" | "EMAIL" | "WHATSAPP";
  dedupeKey: string;
  payload: NotificationDeliveryPayload;
  /** When the job becomes eligible (email cooldown/digest delay). */
  availableAt?: Date;
};

/**
 * Insert a durable delivery job. Unique on (membershipId, channel, dedupeKey).
 * If a PENDING job already exists for the same key, refresh its payload (digest merge).
 */
export async function enqueueNotificationDelivery(
  input: EnqueueDeliveryInput,
): Promise<{ id: string; duplicate: boolean }> {
  const db = getDatabase();
  try {
    const [row] = await db
      .insert(notificationDeliveries)
      .values({
        organizationId: input.organizationId,
        membershipId: input.membershipId,
        userId: input.userId,
        notificationId: input.notificationId,
        conversationId: input.conversationId,
        customerId: input.customerId,
        channel: input.channel,
        status: "PENDING",
        dedupeKey: input.dedupeKey,
        payload: input.payload,
        availableAt: input.availableAt ?? new Date(),
      })
      .returning();
    if (!row) throw new Error("Failed to enqueue notification delivery");
    return { id: row.id, duplicate: false };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Merge into existing PENDING job (email digest accumulation)
    const [existing] = await db
      .select()
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.membershipId, input.membershipId),
          eq(notificationDeliveries.channel, input.channel),
          eq(notificationDeliveries.dedupeKey, input.dedupeKey),
        ),
      )
      .limit(1);
    if (!existing) throw err;
    if (existing.status === "PENDING" || existing.status === "FAILED") {
      const prev = (existing.payload ?? {}) as NotificationDeliveryPayload;
      const mergedCount = (prev.messageCount ?? 1) + 1;
      const [updated] = await db
        .update(notificationDeliveries)
        .set({
          payload: {
            ...prev,
            ...input.payload,
            messageCount: mergedCount,
            preview: input.payload.preview ?? prev.preview,
          },
          notificationId: input.notificationId ?? existing.notificationId,
          status: "PENDING",
          lastError: null,
          // Keep original availableAt for delayed email; push stays immediate
          updatedAt: new Date(),
        })
        .where(eq(notificationDeliveries.id, existing.id))
        .returning();
      return { id: updated?.id ?? existing.id, duplicate: true };
    }
    return { id: existing.id, duplicate: true };
  }
}

/**
 * Claim and process due notification delivery jobs (SKIP LOCKED).
 * Safe to call from request-path flush or a background worker.
 */
export async function processNotificationDeliveries(options?: {
  organizationId?: string;
  limit?: number;
}): Promise<{ processed: number; claimed: number }> {
  const db = getDatabase();
  const limit = options?.limit ?? 20;

  const claimedIds = await db.transaction(async (tx) => {
    const orgClause = options?.organizationId
      ? sql`AND organization_id = ${options.organizationId}::uuid`
      : sql``;
    const result = await tx.execute(sql`
      UPDATE notification_deliveries
      SET status = 'PROCESSING',
          attempt_count = attempt_count + 1,
          updated_at = now()
      WHERE id IN (
        SELECT id FROM notification_deliveries
        WHERE status IN ('PENDING', 'FAILED')
          AND available_at <= now()
          AND attempt_count < ${MAX_ATTEMPTS}
          ${orgClause}
        ORDER BY available_at ASC, created_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `);
    return parseClaimedIds(result);
  });

  if (!claimedIds.length) {
    return { processed: 0, claimed: 0 };
  }

  let processed = 0;
  for (const id of claimedIds) {
    const [row] = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.id, id))
      .limit(1);
    if (!row) continue;

    try {
      const payload = (row.payload ?? {}) as NotificationDeliveryPayload;
      if (row.channel === "PUSH") {
        await sendPushToUser(row.userId, {
          title: payload.customerName ?? "New message",
          body: payload.preview ?? "You have a new message",
          conversationId: row.conversationId,
          organizationId: row.organizationId,
          url: payload.conversationUrl ?? undefined,
        });
      } else if (row.channel === "EMAIL") {
        // Recipient is resolved at enqueue time into payload? We need email on user
        // Re-fetch is safer — no email stored in payload for privacy
        const { users } = await import("@/db/schema");
        const [u] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, row.userId))
          .limit(1);
        if (!u?.email) {
          await db
            .update(notificationDeliveries)
            .set({
              status: "CANCELLED",
              lastError: "No email on user",
              updatedAt: new Date(),
            })
            .where(eq(notificationDeliveries.id, id));
          continue;
        }
        const ok = await sendNotificationEmail({
          to: u.email,
          customerName: payload.customerName ?? "Customer",
          organizationName: payload.organizationName,
          channel: payload.channelLabel ?? "WEB",
          preview: payload.preview ?? "New message",
          conversationUrl:
            payload.conversationUrl ??
            `${process.env.APP_URL ?? ""}/app/inbox`,
          messageCount: payload.messageCount ?? 1,
        });
        if (!ok) {
          throw new Error("Email provider rejected or is not configured");
        }
      } else if (row.channel === "WHATSAPP") {
        const { sendWhatsAppNotification } = await import(
          "@/lib/notifications/whatsapp"
        );
        const to = payload.toPhoneE164;
        if (!to) {
          await db
            .update(notificationDeliveries)
            .set({
              status: "CANCELLED",
              lastError: "Missing recipient phone",
              updatedAt: new Date(),
            })
            .where(eq(notificationDeliveries.id, id));
          continue;
        }
        await sendWhatsAppNotification({
          to,
          customerName: payload.customerName ?? "Customer",
          organizationName: payload.organizationName,
          channelLabel: payload.channelLabel ?? "WEB",
          preview: payload.preview ?? "New message",
          conversationUrl:
            payload.conversationUrl ??
            `${process.env.APP_URL ?? ""}/app/inbox`,
          messageCount: payload.messageCount ?? 1,
        });
      }

      await db
        .update(notificationDeliveries)
        .set({
          status: "SENT",
          sentAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(notificationDeliveries.id, id));
      processed += 1;
    } catch (error) {
      const reason =
        error instanceof Error ? error.message.slice(0, 300) : "failed";
      const failPermanent = row.attemptCount >= MAX_ATTEMPTS;
      const nextAt = new Date(
        Date.now() + backoffSeconds(row.attemptCount) * 1000,
      );
      await db
        .update(notificationDeliveries)
        .set({
          status: failPermanent ? "FAILED" : "PENDING",
          lastError: reason,
          availableAt: failPermanent ? row.availableAt : nextAt,
          updatedAt: new Date(),
        })
        .where(eq(notificationDeliveries.id, id));
    }
  }

  return { processed, claimed: claimedIds.length };
}

export { MAX_ATTEMPTS as NOTIFICATION_DELIVERY_MAX_ATTEMPTS };
