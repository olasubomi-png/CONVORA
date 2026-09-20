import { requireAuthenticatedUser } from "@/lib/authz/context";
import { getOrgWorkload } from "@/lib/teams/workload";
import { jsonError, jsonOk } from "@/lib/api/response";
import { ValidationError } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const organizationId = new URL(request.url).searchParams.get(
      "organizationId",
    );
    if (!organizationId) {
      throw new ValidationError("organizationId is required.");
    }
    const workload = await getOrgWorkload(auth.user.id, organizationId);
    return jsonOk({ workload });
  } catch (error) {
    return jsonError(error);
  }
}
