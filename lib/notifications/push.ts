import webpush from "web-push";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { getServerEnv } from "@/lib/env";

export function isWebPushConfigured(): boolean {
  try {
    const env = getServerEnv();
    return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
  } catch {
    return Boolean(
      process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
    );
  }
}

function configureVapid() {
  const env = getServerEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return false;
  }
  webpush.setVapidDetails(
    env.VAPID_SUBJECT || env.APP_URL || "mailto:ops@convora.app",
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  return true;
}

export function getVapidPublicKey(): string | null {
  try {
    return getServerEnv().VAPID_PUBLIC_KEY ?? null;
  } catch {
    return process.env.VAPID_PUBLIC_KEY ?? null;
  }
}

export async function savePushSubscription(input: {
  userId: string;
  membershipId: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}) {
  const db = getDatabase();
  const [existing] = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, input.endpoint))
    .limit(1);
  if (existing) {
    if (existing.userId !== input.userId) {
      // Endpoint belongs to another user — replace ownership carefully
      await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.id, existing.id));
    } else {
      const [updated] = await db
        .update(pushSubscriptions)
        .set({
          p256dh: input.p256dh,
          auth: input.auth,
          membershipId: input.membershipId,
          userAgent: input.userAgent ?? existing.userAgent,
          lastUsedAt: new Date(),
        })
        .where(eq(pushSubscriptions.id, existing.id))
        .returning();
      return updated;
    }
  }
  const [row] = await db
    .insert(pushSubscriptions)
    .values({
      userId: input.userId,
      membershipId: input.membershipId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
      lastUsedAt: new Date(),
    })
    .returning();
  return row;
}

export async function removePushSubscription(
  userId: string,
  endpoint: string,
) {
  const db = getDatabase();
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    );
}

export async function sendPushToUser(
  userId: string,
  payload: {
    title: string;
    body: string;
    conversationId?: string | null;
    organizationId?: string | null;
    url?: string | null;
  },
): Promise<{ sent: number; removed: number }> {
  if (!configureVapid()) {
    return { sent: 0, removed: 0 };
  }
  const db = getDatabase();
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  let sent = 0;
  let removed = 0;
  const data = JSON.stringify(payload);

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        data,
        { TTL: 60 },
      );
      sent += 1;
      await db
        .update(pushSubscriptions)
        .set({ lastUsedAt: new Date() })
        .where(eq(pushSubscriptions.id, sub.id));
    } catch (err) {
      const status =
        err && typeof err === "object" && "statusCode" in err
          ? Number((err as { statusCode: number }).statusCode)
          : 0;
      if (status === 404 || status === 410) {
        await db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.id, sub.id));
        removed += 1;
      }
      // Other failures are ignored — push must not break messaging
    }
  }
  return { sent, removed };
}
