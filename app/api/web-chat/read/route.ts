import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import {
  markConversationSeenByVisitor,
  markMessagesDelivered,
} from "@/lib/messaging/receipts";
import { requireVisitorSession } from "@/lib/web-chat/visitor";
import { AuthorizationError } from "@/lib/errors";
import { parseInput, z } from "@/lib/validation";

const bodySchema = z.object({
  upToMessageId: z.string().uuid().optional().nullable(),
  deliveredMessageIds: z.array(z.string().uuid()).max(100).optional(),
});

export async function POST(request: Request) {
  try {
    const token =
      request.headers.get("x-convora-visitor-token")?.trim() ?? "";
    if (!token) throw new AuthorizationError("Visitor session is required.");
    const { visitor } = await requireVisitorSession(token);
    const body = await request.json().catch(() => ({}));
    const input = parseInput(bodySchema, body);

    if (input.deliveredMessageIds?.length && visitor.conversationId) {
      await markMessagesDelivered(
        visitor.conversationId,
        input.deliveredMessageIds,
        "CUSTOMER",
      );
    }
    const seen = await markConversationSeenByVisitor(
      token,
      input.upToMessageId,
    );
    return NextResponse.json({ ok: true, seen });
  } catch (error) {
    return jsonError(error);
  }
}
