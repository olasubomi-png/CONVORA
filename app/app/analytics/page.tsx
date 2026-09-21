import Link from "next/link";
import { requireAuthenticatedUser, getUserOrganizationContexts } from "@/lib/authz/context";
import { Container } from "@/components/ui/container";
import { parseAnalyticsFilters } from "@/lib/analytics/filters";
import { getAnalyticsOverview } from "@/lib/analytics/queries";
import { ValidationError } from "@/lib/errors";

export const metadata = { title: "Analytics — CONVORA" };

function fmtMs(ms: number | null): string {
  if (ms === null || Number.isNaN(ms)) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function fmtPct(v: number | null): string {
  if (v === null) return "—";
  return `${Math.round(v * 100)}%`;
}

function BarChart({
  data,
  labelKey,
  valueKey,
}: {
  data: { [k: string]: string | number }[];
  labelKey: string;
  valueKey: string;
}) {
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey] ?? 0)));
  if (data.length === 0 || data.every((d) => Number(d[valueKey]) === 0)) {
    return (
      <p className="text-sm text-[#5c5c5c]">No data for this period.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {data.map((row) => {
        const v = Number(row[valueKey] ?? 0);
        const pct = Math.round((v / max) * 100);
        return (
          <li key={String(row[labelKey])} className="text-sm">
            <div className="mb-1 flex justify-between gap-2">
              <span className="text-[#3f3f3f]">{String(row[labelKey])}</span>
              <span className="tabular-nums text-[#141414]">{v}</span>
            </div>
            <div className="h-2 bg-[#ecece9]">
              <div
                className="h-2 bg-[#1f4e3d]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireAuthenticatedUser();
  const memberships = await getUserOrganizationContexts(auth.user.id);
  const params = await searchParams;

  const organizationId =
    (typeof params.org === "string" ? params.org : null) ??
    memberships[0]?.organizationId ??
    null;

  if (!organizationId) {
    return (
      <Container className="py-12">
        <h1 className="text-2xl tracking-tight">Analytics</h1>
        <p className="mt-4 text-sm text-[#5c5c5c]">
          Join or create an organization to view analytics.
        </p>
      </Container>
    );
  }

  const preset =
    typeof params.preset === "string" ? params.preset : "last_30_days";
  const channel =
    typeof params.channel === "string" ? params.channel : undefined;
  const status =
    typeof params.status === "string" ? params.status : undefined;
  const priority =
    typeof params.priority === "string" ? params.priority : undefined;

  let overview = null;
  let error: string | null = null;
  try {
    const filters = parseAnalyticsFilters({
      organizationId,
      preset,
      channel,
      status,
      priority,
    });
    overview = await getAnalyticsOverview(auth.user.id, filters);
  } catch (e) {
    error =
      e instanceof ValidationError
        ? e.message
        : "Unable to load analytics.";
  }

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ org: organizationId, preset, ...extra });
    if (channel) p.set("channel", channel);
    if (status) p.set("status", status);
    if (priority) p.set("priority", priority);
    for (const [k, v] of Object.entries(extra)) {
      if (!v) p.delete(k);
      else p.set(k, v);
    }
    return `?${p.toString()}`;
  };

  return (
    <Container className="py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-[#5c5c5c]">
            Organization performance from live conversation data (UTC).
          </p>
        </div>
        <a
          href={`/api/analytics/export?organizationId=${organizationId}&preset=${preset}${channel ? `&channel=${channel}` : ""}`}
          className="border border-[#e4e4e2] bg-white px-3 py-2 text-sm hover:bg-[#f8f8f7]"
        >
          Export CSV
        </a>
      </div>

      <form className="mt-6 flex flex-wrap gap-3 border border-[#e4e4e2] bg-white p-4 text-sm">
        <input type="hidden" name="org" value={organizationId} />
        <label className="flex flex-col gap-1">
          <span className="text-[#5c5c5c]">Range</span>
          <select
            name="preset"
            defaultValue={preset}
            className="border border-[#e4e4e2] bg-white px-2 py-1.5"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last_7_days">Last 7 days</option>
            <option value="last_30_days">Last 30 days</option>
            <option value="last_90_days">Last 90 days</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[#5c5c5c]">Channel</span>
          <select
            name="channel"
            defaultValue={channel ?? ""}
            className="border border-[#e4e4e2] bg-white px-2 py-1.5"
          >
            <option value="">All</option>
            <option value="WEB">Web</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="EMAIL">Email</option>
            <option value="SMS">SMS</option>
            <option value="FACEBOOK">Facebook</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[#5c5c5c]">Status</span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="border border-[#e4e4e2] bg-white px-2 py-1.5"
          >
            <option value="">All</option>
            <option value="OPEN">Open</option>
            <option value="PENDING">Pending</option>
            <option value="CLOSED">Closed</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[#5c5c5c]">Priority</span>
          <select
            name="priority"
            defaultValue={priority ?? ""}
            className="border border-[#e4e4e2] bg-white px-2 py-1.5"
          >
            <option value="">All</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </label>
        <button
          type="submit"
          className="self-end bg-[#1f4e3d] px-4 py-2 text-white hover:bg-[#173b2e]"
        >
          Apply
        </button>
      </form>

      {error ? (
        <p className="mt-6 text-sm text-red-700">{error}</p>
      ) : null}

      {!error && overview ? (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                label: "Conversations",
                value: overview.summary.conversationsTotal,
              },
              {
                label: "Messages (in / out)",
                value: `${overview.summary.messagesInbound} / ${overview.summary.messagesOutbound}`,
              },
              {
                label: "New customers",
                value: overview.summary.customersNew,
              },
              {
                label: "Resolution rate",
                value: fmtPct(overview.summary.resolutionRate),
              },
              {
                label: "Avg first response",
                value: fmtMs(overview.summary.avgFirstResponseMs),
              },
              {
                label: "Avg resolution time",
                value: fmtMs(overview.summary.avgResolutionMs),
              },
            ].map((card) => (
              <div
                key={card.label}
                className="border border-[#e4e4e2] bg-white p-4"
              >
                <p className="text-xs uppercase tracking-wide text-[#5c5c5c]">
                  {card.label}
                </p>
                <p className="mt-2 text-2xl tabular-nums tracking-tight">
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section className="border border-[#e4e4e2] bg-white p-4">
              <h2 className="text-sm font-medium">Conversations by day</h2>
              <div className="mt-4">
                <BarChart
                  data={overview.series.conversationsByDay}
                  labelKey="date"
                  valueKey="count"
                />
              </div>
            </section>
            <section className="border border-[#e4e4e2] bg-white p-4">
              <h2 className="text-sm font-medium">Messages by day</h2>
              <div className="mt-4">
                <BarChart
                  data={overview.series.messagesByDay.map((r) => ({
                    date: r.date,
                    count: r.inbound + r.outbound,
                  }))}
                  labelKey="date"
                  valueKey="count"
                />
              </div>
            </section>
            <section className="border border-[#e4e4e2] bg-white p-4">
              <h2 className="text-sm font-medium">By channel</h2>
              <div className="mt-4">
                <BarChart
                  data={overview.breakdowns.byChannel}
                  labelKey="channel"
                  valueKey="count"
                />
              </div>
            </section>
            <section className="border border-[#e4e4e2] bg-white p-4">
              <h2 className="text-sm font-medium">By status</h2>
              <div className="mt-4">
                <BarChart
                  data={overview.breakdowns.byStatus}
                  labelKey="status"
                  valueKey="count"
                />
              </div>
            </section>
          </div>

          <section className="mt-8 border border-[#e4e4e2] bg-white">
            <div className="border-b border-[#e4e4e2] px-4 py-3">
              <h2 className="text-sm font-medium">Agent performance</h2>
            </div>
            {overview.agents.length === 0 ? (
              <p className="p-4 text-sm text-[#5c5c5c]">No agents found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-[#f8f8f7] text-[#5c5c5c]">
                    <tr>
                      <th className="px-4 py-2 font-medium">Agent</th>
                      <th className="px-4 py-2 font-medium">Assigned</th>
                      <th className="px-4 py-2 font-medium">Resolved</th>
                      <th className="px-4 py-2 font-medium">Messages</th>
                      <th className="px-4 py-2 font-medium">Resolution rate</th>
                      <th className="px-4 py-2 font-medium">Avg resolution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.agents.map((a) => (
                      <tr
                        key={a.membershipId}
                        className="border-t border-[#e4e4e2]"
                      >
                        <td className="px-4 py-2">
                          <div>{a.fullName ?? a.email}</div>
                          <div className="text-xs text-[#5c5c5c]">{a.email}</div>
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {a.conversationsAssigned}
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {a.conversationsResolved}
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {a.messagesSent}
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {fmtPct(a.resolutionRate)}
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {fmtMs(a.avgResolutionMs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="mt-6 text-xs text-[#5c5c5c]">
            Window: {overview.range.from} → {overview.range.to} (UTC).{" "}
            <Link href={qs({ preset: "last_7_days" })} className="underline">
              7 days
            </Link>
          </p>
        </>
      ) : null}
    </Container>
  );
}
