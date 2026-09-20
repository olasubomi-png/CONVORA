import { requireAuthenticatedUser } from "@/lib/authz/context";
import { listMessages, sendAgentMessage } from "@/lib/conversations/messages";
import { parseInput } from "@/lib/validation";
import { sendMessageSchema } from "@/lib/validation/conversations";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { id } = await params;
    const url = new URL(request.url);
    const before = url.searchParams.get("before") ?? undefined;
    const result = await listMessages(auth.user.id, id, { before });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { id } = await params;
    const body = await request.json();
    const input = parseInput(sendMessageSchema, body);
    const message = await sendAgentMessage(auth.user.id, id, input.body);
    return jsonOk({ message }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
