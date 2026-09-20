import { requireAuthenticatedUser } from "@/lib/authz/context";
import { markConversationRead } from "@/lib/conversations/read-state";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { id } = await params;
    let messageId: string | undefined;
    try {
      const body = await request.json();
      if (typeof body?.messageId === "string") messageId = body.messageId;
    } catch {
      /* empty body ok */
    }
    await markConversationRead(auth.user.id, id, messageId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
