import { requireAuthenticatedUser } from "@/lib/authz/context";
import { getConversationDetail } from "@/lib/conversations/list";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { id } = await params;
    const detail = await getConversationDetail(auth.user.id, id);
    return jsonOk(detail);
  } catch (error) {
    return jsonError(error);
  }
}
