import { requireAuthenticatedUser } from "@/lib/authz/context";
import {
  getCustomerAttributes,
  setCustomerAttributes,
} from "@/lib/customers/attributes";
import { parseInput } from "@/lib/validation";
import { customerAttributesBodySchema } from "@/lib/validation/customers";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ customerId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { customerId } = await params;
    const attributes = await getCustomerAttributes(auth.user.id, customerId);
    return jsonOk({ attributes });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { customerId } = await params;
    const body = await request.json();
    const input = parseInput(customerAttributesBodySchema, body);
    await setCustomerAttributes(auth.user.id, customerId, input.values);
    const attributes = await getCustomerAttributes(auth.user.id, customerId);
    return jsonOk({ attributes });
  } catch (error) {
    return jsonError(error);
  }
}
