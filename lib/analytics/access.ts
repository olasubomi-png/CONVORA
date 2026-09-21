import { getActiveMembership } from "@/lib/authz/membership";
import { AuthorizationError } from "@/lib/errors";

/** Any active org member may view analytics for their organization. */
export async function requireAnalyticsAccess(
  userId: string,
  organizationId: string,
) {
  const membership = await getActiveMembership(userId, organizationId);
  if (!membership) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }
  return membership;
}
