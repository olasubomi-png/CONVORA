import {
  sendVisitorMessage,
  listVisitorMessages,
  requireVisitorSession,
} from "@/lib/web-chat/visitor";
import { parseInput, z } from "@/lib/validation";
import { jsonError, jsonOk } from "@/lib/api/response";
import { AuthorizationError } from "@/lib/errors";

function sessionFromRequest(request: Request): string {
  const header = request.headers.get("x-convora-visitor-token");
  if (!header) throw new AuthorizationError("Visitor session is required.");
  return header;
}

const postSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  clientMessageId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  try {
    const token = sessionFromRequest(request);
    await requireVisitorSession(token);
    const result = await listVisitorMessages(token);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const token = sessionFromRequest(request);
    const body = await request.json();
    const input = parseInput(postSchema, body);
    const message = await sendVisitorMessage(
      token,
      input.body,
      input.clientMessageId,
    );
    return jsonOk({
      message: {
        id: message.id,
        body: message.body,
        role: "visitor",
        createdAt: message.createdAt,
      },
    }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
