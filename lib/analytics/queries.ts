import { and, eq, gte, lt, sql, isNull, isNotNull } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  conversations,
  messages,
  customers,
  memberships,
  users,
} from "@/db/schema";
import type { AnalyticsFilters } from "@/lib/analytics/filters";
import {
  conversationWindowPredicates,
  messageWindowPredicates,
} from "@/lib/analytics/predicates";
import { enumerateUtcDays } from "@/lib/analytics/range";
import { requireAnalyticsAccess } from "@/lib/analytics/access";

export type AnalyticsOverview = {
  range: { from: string; to: string; preset: string };
  filters: {
    channel?: string;
    status?: string;
    priority?: string;
    agentMembershipId?: string;
  };
  summary: {
    conversationsTotal: number;
    conversationsOpen: number;
    conversationsPending: number;
    conversationsClosed: number;
    messagesInbound: number;
    messagesOutbound: number;
    customersNew: number;
    customersTotal: number;
    resolutionRate: number | null;
    avgFirstResponseMs: number | null;
    avgResolutionMs: number | null;
  };
  series: {
    conversationsByDay: { date: string; count: number }[];
    messagesByDay: { date: string; inbound: number; outbound: number }[];
    customersByDay: { date: string; count: number }[];
  };
  breakdowns: {
    byStatus: { status: string; count: number }[];
    byPriority: { priority: string; count: number }[];
    byChannel: { channel: string; count: number }[];
  };
  agents: {
    membershipId: string;
    userId: string;
    fullName: string | null;
    email: string;
    conversationsAssigned: number;
    conversationsResolved: number;
    messagesSent: number;
    avgResolutionMs: number | null;
    resolutionRate: number | null;
  }[];
};

export async function listOrganizationAgents(
  actorUserId: string,
  organizationId: string,
) {
  await requireAnalyticsAccess(actorUserId, organizationId);
  const db = getDatabase();
  return db
    .select({
      membershipId: memberships.id,
      userId: memberships.userId,
      fullName: users.fullName,
      email: users.email,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.status, "ACTIVE"),
      ),
    )
    .orderBy(users.email);
}

export async function getAnalyticsOverview(
  actorUserId: string,
  filters: AnalyticsFilters,
): Promise<AnalyticsOverview> {
  await requireAnalyticsAccess(actorUserId, filters.organizationId);
  const db = getDatabase();
  const orgId = filters.organizationId;
  const { from, to } = filters.range;
  const convWhere = conversationWindowPredicates(filters);

  // Messages: join conversations, same conversation filters + message time window
  const msgWhere = and(
    messageWindowPredicates(filters),
    isNull(messages.deletedAt),
  );

  const [statusRows, priorityRows, channelRows, convTotals] = await Promise.all([
    db
      .select({
        status: conversations.status,
        count: sql<number>`count(*)::int`,
      })
      .from(conversations)
      .where(convWhere)
      .groupBy(conversations.status),
    db
      .select({
        priority: conversations.priority,
        count: sql<number>`count(*)::int`,
      })
      .from(conversations)
      .where(convWhere)
      .groupBy(conversations.priority),
    db
      .select({
        channel: conversations.channel,
        count: sql<number>`count(*)::int`,
      })
      .from(conversations)
      .where(convWhere)
      .groupBy(conversations.channel),
    db
      .select({
        total: sql<number>`count(*)::int`,
        open: sql<number>`count(*) filter (where ${conversations.status} = 'OPEN')::int`,
        pending: sql<number>`count(*) filter (where ${conversations.status} = 'PENDING')::int`,
        closed: sql<number>`count(*) filter (where ${conversations.status} = 'CLOSED')::int`,
      })
      .from(conversations)
      .where(convWhere),
  ]);

  const totals = convTotals[0] ?? {
    total: 0,
    open: 0,
    pending: 0,
    closed: 0,
  };

  const [msgCounts] = await db
    .select({
      inbound: sql<number>`count(*) filter (where ${messages.senderType} = 'CUSTOMER')::int`,
      outbound: sql<number>`count(*) filter (where ${messages.senderType} = 'MEMBERSHIP')::int`,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(msgWhere);

  const customerWhere = and(
    eq(customers.organizationId, orgId),
    gte(customers.createdAt, from),
    lt(customers.createdAt, to),
  );
  const [customersNew] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(customerWhere);
  const [customersTotal] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(eq(customers.organizationId, orgId));

  const convDays = await db
    .select({
      day: sql<string>`to_char((${conversations.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(conversations)
    .where(convWhere)
    .groupBy(
      sql`to_char((${conversations.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
    );

  const msgDays = await db
    .select({
      day: sql<string>`to_char((${messages.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      inbound: sql<number>`count(*) filter (where ${messages.senderType} = 'CUSTOMER')::int`,
      outbound: sql<number>`count(*) filter (where ${messages.senderType} = 'MEMBERSHIP')::int`,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(msgWhere)
    .groupBy(
      sql`to_char((${messages.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
    );

  const custDays = await db
    .select({
      day: sql<string>`to_char((${customers.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(customers)
    .where(customerWhere)
    .groupBy(
      sql`to_char((${customers.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
    );

  const days = enumerateUtcDays(from, to);
  const convMap = new Map(convDays.map((r) => [r.day, Number(r.count)]));
  const msgMap = new Map(
    msgDays.map((r) => [
      r.day,
      { inbound: Number(r.inbound), outbound: Number(r.outbound) },
    ]),
  );
  const custMap = new Map(custDays.map((r) => [r.day, Number(r.count)]));

  const [resolution] = await db
    .select({
      avgMs: sql<number | null>`avg(extract(epoch from (${conversations.closedAt} - ${conversations.createdAt})) * 1000)`,
    })
    .from(conversations)
    .where(
      and(
        convWhere,
        eq(conversations.status, "CLOSED"),
        isNotNull(conversations.closedAt),
      ),
    );

  // First response: first MEMBERSHIP message per filtered conversation
  // Uses same conversationPredicates via join
  const firstResponseSubq = db
    .select({
      conversationId: messages.conversationId,
      firstAgentAt: sql<Date>`min(${messages.createdAt})`.as("first_agent_at"),
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        conversationWindowPredicates(filters),
        eq(messages.senderType, "MEMBERSHIP"),
        isNull(messages.deletedAt),
      ),
    )
    .groupBy(messages.conversationId)
    .as("fr");

  const [firstResponse] = await db
    .select({
      avgMs: sql<number | null>`avg(extract(epoch from (${firstResponseSubq.firstAgentAt} - ${conversations.createdAt})) * 1000)`,
    })
    .from(firstResponseSubq)
    .innerJoin(
      conversations,
      eq(firstResponseSubq.conversationId, conversations.id),
    )
    .where(convWhere);

  const closedCount = Number(totals.closed ?? 0);
  const totalCount = Number(totals.total ?? 0);
  const resolutionRate = totalCount > 0 ? closedCount / totalCount : null;

  // Agent rows: scoped to org; conversation metrics use same filters
  const agentMembershipWhere = and(
    eq(memberships.organizationId, orgId),
    eq(memberships.status, "ACTIVE"),
    filters.agentMembershipId
      ? eq(memberships.id, filters.agentMembershipId)
      : undefined,
  );

  const agentRows = await db
    .select({
      membershipId: memberships.id,
      userId: memberships.userId,
      fullName: users.fullName,
      email: users.email,
      assigned: sql<number>`count(distinct ${conversations.id})::int`,
      resolved: sql<number>`count(distinct ${conversations.id}) filter (where ${conversations.status} = 'CLOSED')::int`,
      avgResolutionMs: sql<number | null>`avg(extract(epoch from (${conversations.closedAt} - ${conversations.createdAt})) * 1000) filter (where ${conversations.status} = 'CLOSED' and ${conversations.closedAt} is not null)`,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .leftJoin(
      conversations,
      and(
        eq(conversations.assignedToMembershipId, memberships.id),
        conversationWindowPredicates(filters),
      ),
    )
    .where(agentMembershipWhere)
    .groupBy(memberships.id, memberships.userId, users.fullName, users.email);

  // Agent messages sent: membership messages on filtered conversations in range
  const agentMsgRows = await db
    .select({
      membershipId: messages.senderMembershipId,
      sent: sql<number>`count(*)::int`,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        msgWhere,
        eq(messages.senderType, "MEMBERSHIP"),
        isNotNull(messages.senderMembershipId),
        filters.agentMembershipId
          ? eq(messages.senderMembershipId, filters.agentMembershipId)
          : undefined,
      ),
    )
    .groupBy(messages.senderMembershipId);

  const msgSentMap = new Map(
    agentMsgRows
      .filter((r) => r.membershipId)
      .map((r) => [r.membershipId as string, Number(r.sent)]),
  );

  const agents = agentRows.map((r) => {
    const assigned = Number(r.assigned ?? 0);
    const resolved = Number(r.resolved ?? 0);
    return {
      membershipId: r.membershipId,
      userId: r.userId,
      fullName: r.fullName,
      email: r.email,
      conversationsAssigned: assigned,
      conversationsResolved: resolved,
      messagesSent: msgSentMap.get(r.membershipId) ?? 0,
      avgResolutionMs:
        r.avgResolutionMs != null ? Math.round(Number(r.avgResolutionMs)) : null,
      resolutionRate: assigned > 0 ? resolved / assigned : null,
    };
  });

  return {
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
      preset: filters.preset ?? "last_30_days",
    },
    filters: {
      channel: filters.channel,
      status: filters.status,
      priority: filters.priority,
      agentMembershipId: filters.agentMembershipId,
    },
    summary: {
      conversationsTotal: totalCount,
      conversationsOpen: Number(totals.open ?? 0),
      conversationsPending: Number(totals.pending ?? 0),
      conversationsClosed: closedCount,
      messagesInbound: Number(msgCounts?.inbound ?? 0),
      messagesOutbound: Number(msgCounts?.outbound ?? 0),
      customersNew: Number(customersNew?.count ?? 0),
      customersTotal: Number(customersTotal?.count ?? 0),
      resolutionRate,
      avgFirstResponseMs:
        firstResponse?.avgMs != null
          ? Math.round(Number(firstResponse.avgMs))
          : null,
      avgResolutionMs:
        resolution?.avgMs != null ? Math.round(Number(resolution.avgMs)) : null,
    },
    series: {
      conversationsByDay: days.map((d) => ({
        date: d,
        count: convMap.get(d) ?? 0,
      })),
      messagesByDay: days.map((d) => ({
        date: d,
        inbound: msgMap.get(d)?.inbound ?? 0,
        outbound: msgMap.get(d)?.outbound ?? 0,
      })),
      customersByDay: days.map((d) => ({
        date: d,
        count: custMap.get(d) ?? 0,
      })),
    },
    breakdowns: {
      byStatus: statusRows.map((r) => ({
        status: r.status,
        count: Number(r.count),
      })),
      byPriority: priorityRows.map((r) => ({
        priority: r.priority,
        count: Number(r.count),
      })),
      byChannel: channelRows.map((r) => ({
        channel: r.channel,
        count: Number(r.count),
      })),
    },
    agents,
  };
}
