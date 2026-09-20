import { requireAuthenticatedUser } from "@/lib/authz/context";
import { unassignConversation } from "@/lib/conversations/assignments";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { id } = await params;
    await unassignConversation(auth.user.id, id);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
