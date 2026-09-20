import { requireAuthenticatedUser } from "@/lib/authz/context";
import { removeConversationTag } from "@/lib/conversations/tags";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ id: string; tagId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { id, tagId } = await params;
    await removeConversationTag(auth.user.id, id, tagId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
