import { requireAuthenticatedUser } from "@/lib/authz/context";
import { getCustomerStats } from "@/lib/customers/stats";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ customerId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { customerId } = await params;
    const stats = await getCustomerStats(auth.user.id, customerId);
    return jsonOk({ stats });
  } catch (error) {
    return jsonError(error);
  }
}
