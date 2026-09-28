import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { requireAuthenticatedUser } from "@/lib/authz/context";
import { markConversationSeenByAgent } from "@/lib/messaging/receipts";
import { parseInput, z } from "@/lib/validation";

const bodySchema = z.object({
  upToMessageId: z.string().uuid().optional().nullable(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const auth = await requireAuthenticatedUser();
    const { id: conversationId } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const input = parseInput(bodySchema, body);
    const result = await markConversationSeenByAgent(
      auth.user.id,
      conversationId,
      input.upToMessageId,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return jsonError(error);
  }
}
