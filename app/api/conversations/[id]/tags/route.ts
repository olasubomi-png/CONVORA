import { requireAuthenticatedUser } from "@/lib/authz/context";
import { addConversationTag } from "@/lib/conversations/tags";
import { parseInput } from "@/lib/validation";
import { tagSchema } from "@/lib/validation/conversations";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { id } = await params;
    const body = await request.json();
    const input = parseInput(tagSchema, body);
    const tag = await addConversationTag(auth.user.id, id, input.tagId);
    return jsonOk({ tag });
  } catch (error) {
    return jsonError(error);
  }
}
