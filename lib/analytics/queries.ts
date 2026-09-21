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
import { enumerateUtcDays } from "@/lib/analytics/range";
import { requireAnalyticsAccess } from "@/lib/analytics/access";
import { z } from "zod";

function conversationFilter(f: AnalyticsFilters) {
  const clauses = [
    eq(conversations.organizationId, f.organizationId),
    gte(conversations.createdAt, f.range.from),
    lt(conversations.createdAt, f.range.to),
  ];
  if (f.channel) clauses.push(eq(conversations.channel, f.channel));
  if (f.status) clauses.push(eq(conversations.status, f.status));
  if (f.priority) clauses.push(eq(conversations.priority, f.priority));
  if (f.agentMembershipId) {
    clauses.push(eq(conversations.assignedToMembershipId, f.agentMembershipId));
  }
  return and(...clauses);
}

export type AnalyticsOverview = {
  range: { from: string; to: string; preset: string };
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

export async function getAnalyticsOverview(
  actorUserId: string,
  filters: AnalyticsFilters,
): Promise<AnalyticsOverview> {
  await requireAnalyticsAccess(actorUserId, filters.organizationId);
  const db = getDatabase();
  const orgId = filters.organizationId;
  const { from, to } = filters.range;
  const convWhere = conversationFilter(filters);

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

  // Messages in range for conversations belonging to org (join for tenancy)
  const msgBase = and(
    eq(conversations.organizationId, orgId),
    gte(messages.createdAt, from),
    lt(messages.createdAt, to),
    isNull(messages.deletedAt),
    filters.channel ? eq(conversations.channel, filters.channel) : undefined,
    filters.status ? eq(conversations.status, filters.status) : undefined,
    filters.priority ? eq(conversations.priority, filters.priority) : undefined,
    filters.agentMembershipId
      ? eq(conversations.assignedToMembershipId, filters.agentMembershipId)
      : undefined,
  );

  const [msgCounts] = await db
    .select({
      inbound: sql<number>`count(*) filter (where ${messages.senderType} = 'CUSTOMER')::int`,
      outbound: sql<number>`count(*) filter (where ${messages.senderType} = 'MEMBERSHIP')::int`,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(msgBase);

  // Customers
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

  // Time series: conversations by day
  const convDays = await db
    .select({
      day: sql<string>`to_char((${conversations.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(conversations)
    .where(convWhere)
    .groupBy(sql`to_char((${conversations.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`);

  const msgDays = await db
    .select({
      day: sql<string>`to_char((${messages.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      inbound: sql<number>`count(*) filter (where ${messages.senderType} = 'CUSTOMER')::int`,
      outbound: sql<number>`count(*) filter (where ${messages.senderType} = 'MEMBERSHIP')::int`,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(msgBase)
    .groupBy(sql`to_char((${messages.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`);

  const custDays = await db
    .select({
      day: sql<string>`to_char((${customers.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(customers)
    .where(customerWhere)
    .groupBy(sql`to_char((${customers.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`);

  const days = enumerateUtcDays(from, to);
  const convMap = new Map(convDays.map((r) => [r.day, Number(r.count)]));
  const msgMap = new Map(
    msgDays.map((r) => [
      r.day,
      { inbound: Number(r.inbound), outbound: Number(r.outbound) },
    ]),
  );
  const custMap = new Map(custDays.map((r) => [r.day, Number(r.count)]));

  // Avg resolution time for closed conversations in range
  const [resolution] = await db
    .select({
      avgMs: sql<number | null>`avg(extract(epoch from (${conversations.closedAt} - ${conversations.createdAt})) * 1000)`,
      closed: sql<number>`count(*)::int`,
    })
    .from(conversations)
    .where(
      and(
        convWhere,
        eq(conversations.status, "CLOSED"),
        isNotNull(conversations.closedAt),
      ),
    );

  // First response time via correlated aggregate
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const firstResponseRows = await db.execute(sql`
    SELECT avg(extract(epoch from (sub.first_agent_at - sub.created_at)) * 1000) AS avg_ms
    FROM (
      SELECT conv.created_at,
             min(m.created_at) FILTER (WHERE m.sender_type = 'MEMBERSHIP') AS first_agent_at
      FROM conversations conv
      LEFT JOIN messages m ON m.conversation_id = conv.id AND m.deleted_at IS NULL
      WHERE conv.organization_id = ${orgId}::uuid
        AND conv.created_at >= ${fromIso}::timestamptz
        AND conv.created_at < ${toIso}::timestamptz
      GROUP BY conv.id, conv.created_at
    ) sub
    WHERE sub.first_agent_at IS NOT NULL
  `);
  let firstResponseAvg: number | null = null;
  {
    let rows: unknown[] = [];
    if (Array.isArray(firstResponseRows)) {
      rows = firstResponseRows;
    } else if (
      firstResponseRows &&
      typeof firstResponseRows === "object" &&
      "rows" in firstResponseRows &&
      Array.isArray((firstResponseRows as { rows: unknown[] }).rows)
    ) {
      rows = (firstResponseRows as { rows: unknown[] }).rows;
    }
    const parsed = z
      .object({ avg_ms: z.union([z.number(), z.string(), z.null()]).optional() })
      .safeParse(rows[0]);
    if (parsed.success && parsed.data.avg_ms != null) {
      firstResponseAvg = Math.round(Number(parsed.data.avg_ms));
    }
  }

  
  const closedCount = Number(totals.closed ?? 0);
  const totalCount = Number(totals.total ?? 0);
  const resolutionRate =
    totalCount > 0 ? closedCount / totalCount : null;

  // Agent performance
  const agentRows = await db
    .select({
      membershipId: memberships.id,
      userId: memberships.userId,
      fullName: users.fullName,
      email: users.email,
      assigned: sql<number>`count(distinct ${conversations.id}) filter (where ${conversations.assignedToMembershipId} = ${memberships.id})::int`,
      resolved: sql<number>`count(distinct ${conversations.id}) filter (where ${conversations.assignedToMembershipId} = ${memberships.id} and ${conversations.status} = 'CLOSED')::int`,
      avgResolutionMs: sql<number | null>`avg(extract(epoch from (${conversations.closedAt} - ${conversations.createdAt})) * 1000) filter (where ${conversations.assignedToMembershipId} = ${memberships.id} and ${conversations.status} = 'CLOSED' and ${conversations.closedAt} is not null)`,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .leftJoin(
      conversations,
      and(
        eq(conversations.organizationId, orgId),
        eq(conversations.assignedToMembershipId, memberships.id),
        gte(conversations.createdAt, from),
        lt(conversations.createdAt, to),
        filters.channel ? eq(conversations.channel, filters.channel) : undefined,
        filters.status ? eq(conversations.status, filters.status) : undefined,
        filters.priority ? eq(conversations.priority, filters.priority) : undefined,
      ),
    )
    .where(
      and(
        eq(memberships.organizationId, orgId),
        eq(memberships.status, "ACTIVE"),
        filters.agentMembershipId
          ? eq(memberships.id, filters.agentMembershipId)
          : undefined,
      ),
    )
    .groupBy(memberships.id, memberships.userId, users.fullName, users.email);

  const agentMsgRows = await db
    .select({
      membershipId: messages.senderMembershipId,
      sent: sql<number>`count(*)::int`,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(conversations.organizationId, orgId),
        eq(messages.senderType, "MEMBERSHIP"),
        isNull(messages.deletedAt),
        gte(messages.createdAt, from),
        lt(messages.createdAt, to),
        isNotNull(messages.senderMembershipId),
      ),
    )
    .groupBy(messages.senderMembershipId);

  const msgSentMap = new Map(
    agentMsgRows.map((r) => [r.membershipId, Number(r.sent)]),
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
      avgFirstResponseMs: firstResponseAvg,
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

