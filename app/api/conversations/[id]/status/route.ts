import { requireAuthenticatedUser } from "@/lib/authz/context";
import { changeConversationStatus } from "@/lib/conversations/update";
import { parseInput } from "@/lib/validation";
import { statusSchema } from "@/lib/validation/conversations";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { id } = await params;
    const body = await request.json();
    const input = parseInput(statusSchema, body);
    const conversation = await changeConversationStatus(
      auth.user.id,
      id,
      input.status,
    );
    return jsonOk({ conversation });
  } catch (error) {
    return jsonError(error);
  }
}
