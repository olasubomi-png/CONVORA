import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import { conversations, messages } from "@/db/schema";
import { requireOrgCustomer } from "@/lib/customers/access";

export async function getCustomerStats(
  actorUserId: string,
  customerId: string,
) {
  await requireOrgCustomer(actorUserId, customerId);
  const db = getDatabase();

  const convStats = await db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${conversations.status} = 'OPEN')::int`,
      pending: sql<number>`count(*) filter (where ${conversations.status} = 'PENDING')::int`,
      closed: sql<number>`count(*) filter (where ${conversations.status} = 'CLOSED')::int`,
      lastConversationAt: sql<Date | null>`max(${conversations.createdAt})`,
      lastMessageAt: sql<Date | null>`max(${conversations.lastMessageAt})`,
    })
    .from(conversations)
    .where(eq(conversations.customerId, customerId));

  const msgStats = await db
    .select({
      totalMessages: sql<number>`count(*)::int`,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(conversations.customerId, customerId),
        sql`${messages.deletedAt} is null`,
      ),
    );

  const s = convStats[0];
  return {
    totalConversations: Number(s?.total ?? 0),
    openConversations: Number(s?.open ?? 0),
    pendingConversations: Number(s?.pending ?? 0),
    closedConversations: Number(s?.closed ?? 0),
    totalMessages: Number(msgStats[0]?.totalMessages ?? 0),
    lastConversationAt: s?.lastConversationAt ?? null,
    lastMessageAt: s?.lastMessageAt ?? null,
  };
}
