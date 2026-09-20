import { requireAuthenticatedUser } from "@/lib/authz/context";
import { getCustomerDetail } from "@/lib/customers/list";
import { updateCustomer } from "@/lib/customers/update";
import { parseInput } from "@/lib/validation";
import { updateCustomerBodySchema } from "@/lib/validation/customers";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ customerId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { customerId } = await params;
    const detail = await getCustomerDetail(auth.user.id, customerId);
    return jsonOk(detail);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { customerId } = await params;
    const body = await request.json();
    const input = parseInput(updateCustomerBodySchema, body);
    const customer = await updateCustomer(auth.user.id, customerId, input);
    return jsonOk({ customer });
  } catch (error) {
    return jsonError(error);
  }
}
