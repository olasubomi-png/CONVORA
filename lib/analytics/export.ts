import type { AnalyticsOverview } from "@/lib/analytics/queries";

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const MAX_SERIES_ROWS = 400;
const MAX_AGENT_ROWS = 500;

/**
 * Deterministic multi-section analytics CSV.
 * Sections: meta, summary, by_status, by_priority, by_channel,
 * conversations_by_day, messages_by_day, customers_by_day, agents
 */
export function overviewToCsv(overview: AnalyticsOverview): string {
  const lines: string[] = [];

  lines.push("section,field,value");
  lines.push(`meta,range_from,${escapeCsv(overview.range.from)}`);
  lines.push(`meta,range_to,${escapeCsv(overview.range.to)}`);
  lines.push(`meta,preset,${escapeCsv(overview.range.preset)}`);
  lines.push(`meta,channel,${escapeCsv(overview.filters.channel ?? "")}`);
  lines.push(`meta,status,${escapeCsv(overview.filters.status ?? "")}`);
  lines.push(`meta,priority,${escapeCsv(overview.filters.priority ?? "")}`);
  lines.push(
    `meta,agentMembershipId,${escapeCsv(overview.filters.agentMembershipId ?? "")}`,
  );

  const s = overview.summary;
  const summaryFields: [string, string | number | null][] = [
    ["conversations_total", s.conversationsTotal],
    ["conversations_open", s.conversationsOpen],
    ["conversations_pending", s.conversationsPending],
    ["conversations_closed", s.conversationsClosed],
    ["messages_inbound", s.messagesInbound],
    ["messages_outbound", s.messagesOutbound],
    ["customers_new", s.customersNew],
    ["customers_total", s.customersTotal],
    ["resolution_rate", s.resolutionRate],
    ["avg_first_response_ms", s.avgFirstResponseMs],
    ["avg_resolution_ms", s.avgResolutionMs],
  ];
  for (const [k, v] of summaryFields) {
    lines.push(`summary,${k},${escapeCsv(v)}`);
  }

  for (const row of overview.breakdowns.byStatus) {
    lines.push(`by_status,${escapeCsv(row.status)},${row.count}`);
  }
  for (const row of overview.breakdowns.byPriority) {
    lines.push(`by_priority,${escapeCsv(row.priority)},${row.count}`);
  }
  for (const row of overview.breakdowns.byChannel) {
    lines.push(`by_channel,${escapeCsv(row.channel)},${row.count}`);
  }

  for (const row of overview.series.conversationsByDay.slice(0, MAX_SERIES_ROWS)) {
    lines.push(`conversations_by_day,${escapeCsv(row.date)},${row.count}`);
  }
  for (const row of overview.series.messagesByDay.slice(0, MAX_SERIES_ROWS)) {
    lines.push(
      `messages_by_day,${escapeCsv(row.date)},${row.inbound + row.outbound}`,
    );
  }
  for (const row of overview.series.customersByDay.slice(0, MAX_SERIES_ROWS)) {
    lines.push(`customers_by_day,${escapeCsv(row.date)},${row.count}`);
  }

  lines.push(
    "section,agent_email,assigned,resolved,messages_sent,resolution_rate,avg_resolution_ms",
  );
  for (const a of overview.agents.slice(0, MAX_AGENT_ROWS)) {
    lines.push(
      [
        "agents",
        escapeCsv(a.email),
        a.conversationsAssigned,
        a.conversationsResolved,
        a.messagesSent,
        escapeCsv(a.resolutionRate),
        escapeCsv(a.avgResolutionMs),
      ].join(","),
    );
  }

  return lines.join("\n") + "\n";
}
