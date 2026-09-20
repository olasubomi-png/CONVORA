import { requireAuthenticatedUser } from "@/lib/authz/context";
import { removeCustomerTag } from "@/lib/customers/tags";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ customerId: string; tagId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { customerId, tagId } = await params;
    await removeCustomerTag(auth.user.id, customerId, tagId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
