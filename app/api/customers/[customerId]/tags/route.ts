import { requireAuthenticatedUser } from "@/lib/authz/context";
import {
  addCustomerTag,
  listCustomerTags,
} from "@/lib/customers/tags";
import { parseInput } from "@/lib/validation";
import { customerTagBodySchema } from "@/lib/validation/customers";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ customerId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { customerId } = await params;
    const tags = await listCustomerTags(auth.user.id, customerId);
    return jsonOk({ tags });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { customerId } = await params;
    const body = await request.json();
    const input = parseInput(customerTagBodySchema, body);
    const tag = await addCustomerTag(auth.user.id, customerId, input.tagId);
    return jsonOk({ tag });
  } catch (error) {
    return jsonError(error);
  }
}
