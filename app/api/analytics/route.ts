import { requireAuthenticatedUser } from "@/lib/authz/context";
import { parseAnalyticsFilters } from "@/lib/analytics/filters";
import { getAnalyticsOverview } from "@/lib/analytics/queries";
import { requirePermission } from "@/lib/authz/permissions";
import { jsonError, jsonOk } from "@/lib/api/response";

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
      "analytics.view",
    );
    const overview = await getAnalyticsOverview(auth.user.id, filters);
    return jsonOk({ overview });
  } catch (error) {
    return jsonError(error);
  }
}
