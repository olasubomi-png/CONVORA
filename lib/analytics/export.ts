import type { AnalyticsOverview } from "@/lib/analytics/queries";

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const MAX_EXPORT_ROWS = 5_000;

export function overviewToCsv(overview: AnalyticsOverview): string {
  const lines: string[] = [];
  lines.push("section,key,value");
  lines.push(
    `summary,conversationsTotal,${overview.summary.conversationsTotal}`,
  );
  lines.push(`summary,conversationsOpen,${overview.summary.conversationsOpen}`);
  lines.push(
    `summary,conversationsClosed,${overview.summary.conversationsClosed}`,
  );
  lines.push(`summary,messagesInbound,${overview.summary.messagesInbound}`);
  lines.push(`summary,messagesOutbound,${overview.summary.messagesOutbound}`);
  lines.push(`summary,customersNew,${overview.summary.customersNew}`);
  lines.push(`summary,customersTotal,${overview.summary.customersTotal}`);
  lines.push(
    `summary,resolutionRate,${overview.summary.resolutionRate ?? ""}`,
  );
  lines.push(
    `summary,avgFirstResponseMs,${overview.summary.avgFirstResponseMs ?? ""}`,
  );
  lines.push(
    `summary,avgResolutionMs,${overview.summary.avgResolutionMs ?? ""}`,
  );

  for (const row of overview.series.conversationsByDay.slice(0, MAX_EXPORT_ROWS)) {
    lines.push(`conversationsByDay,${escapeCsv(row.date)},${row.count}`);
  }
  for (const row of overview.series.messagesByDay.slice(0, MAX_EXPORT_ROWS)) {
    lines.push(
      `messagesByDay,${escapeCsv(row.date)},${row.inbound + row.outbound}`,
    );
  }
  for (const row of overview.breakdowns.byChannel) {
    lines.push(`byChannel,${escapeCsv(row.channel)},${row.count}`);
  }
  for (const row of overview.breakdowns.byStatus) {
    lines.push(`byStatus,${escapeCsv(row.status)},${row.count}`);
  }
  for (const agent of overview.agents.slice(0, MAX_EXPORT_ROWS)) {
    lines.push(
      `agent,${escapeCsv(agent.email)},${agent.conversationsAssigned}`,
    );
  }
  return lines.join("\n") + "\n";
}
