import { requireAuthenticatedUser } from "@/lib/authz/context";
import { parseAnalyticsFilters } from "@/lib/analytics/filters";
import { getAnalyticsOverview } from "@/lib/analytics/queries";
import { overviewToCsv } from "@/lib/analytics/export";
import { requirePermission } from "@/lib/authz/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { RateLimitError } from "@/lib/errors";
import { jsonError } from "@/lib/api/response";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const url = new URL(request.url);
    const filters = parseAnalyticsFilters({
      organizationId: url.searchParams.get("organizationId"),
      preset: url.searchParams.get("preset"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      channel: url.searchParams.get("channel"),
      status: url.searchParams.get("status"),
      priority: url.searchParams.get("priority"),
      agentMembershipId: url.searchParams.get("agentMembershipId"),
    });
    await requirePermission(
      auth.user.id,
      filters.organizationId,
      "analytics.export",
    );
    const rl = checkRateLimit({
      key: `analytics-export:${auth.user.id}:${filters.organizationId}`,
      limit: 20,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      throw new RateLimitError("Too many export requests. Please wait.");
    }
    const overview = await getAnalyticsOverview(auth.user.id, filters);
    const csv = overviewToCsv(overview);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="convora-analytics.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
