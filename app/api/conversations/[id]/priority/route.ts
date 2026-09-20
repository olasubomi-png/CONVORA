import { requireAuthenticatedUser } from "@/lib/authz/context";
import { changeConversationPriority } from "@/lib/conversations/update";
import { parseInput } from "@/lib/validation";
import { prioritySchema } from "@/lib/validation/conversations";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { id } = await params;
    const body = await request.json();
    const input = parseInput(prioritySchema, body);
    const conversation = await changeConversationPriority(
      auth.user.id,
      id,
      input.priority,
    );
    return jsonOk({ conversation });
  } catch (error) {
    return jsonError(error);
  }
}
