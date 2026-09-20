import { requireAuthenticatedUser } from "@/lib/authz/context";
import { assignConversation } from "@/lib/conversations/assignments";
import { parseInput } from "@/lib/validation";
import { assignSchema } from "@/lib/validation/conversations";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { id } = await params;
    const body = await request.json();
    const input = parseInput(assignSchema, body);
    const assignment = await assignConversation(
      auth.user.id,
      id,
      input.membershipId,
    );
    return jsonOk({ assignment });
  } catch (error) {
    return jsonError(error);
  }
}
