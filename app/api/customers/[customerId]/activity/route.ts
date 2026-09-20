import { requireAuthenticatedUser } from "@/lib/authz/context";
import { listCustomerActivity } from "@/lib/customers/activity";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ customerId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { customerId } = await params;
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const result = await listCustomerActivity(auth.user.id, customerId, {
      cursor,
    });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
