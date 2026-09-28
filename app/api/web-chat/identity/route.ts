import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { setVisitorIdentity } from "@/lib/web-chat/visitor";
import { parseInput, z } from "@/lib/validation";
import { AuthorizationError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { RateLimitError } from "@/lib/errors";

const bodySchema = z.object({
  displayName: z.string().min(1).max(200),
  email: z.string().max(254).optional().nullable(),
});

function visitorToken(request: Request): string {
  const header = request.headers.get("x-convora-visitor-token");
  if (header?.trim()) return header.trim();
  // cookie fallback is set by session route; identity always requires header for clarity
  return "";
}

export async function POST(request: Request) {
  try {
    const token = visitorToken(request);
    if (!token) {
      throw new AuthorizationError("Visitor session is required.");
    }

    const rl = checkRateLimit({
      key: `wc:identity:${token.slice(0, 24)}`,
      limit: 20,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      throw new RateLimitError("Too many identity updates. Try again shortly.");
    }

    const body = await request.json();
    const input = parseInput(bodySchema, body);
    const result = await setVisitorIdentity(token, {
      displayName: input.displayName,
      email: input.email,
    });

    return NextResponse.json({
      ok: true,
      identity: {
        displayName: result.displayName,
        email: result.email,
      },
      conversationId: result.conversationId,
    });
  } catch (error) {
    return jsonError(error);
  }
}
