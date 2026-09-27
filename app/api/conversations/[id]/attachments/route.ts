import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authz/context";
import { requireOrgConversation } from "@/lib/conversations/access";
import {
  MAX_CHAT_IMAGE_BYTES,
  storeImageAsset,
} from "@/lib/storage";
import { ValidationError, RateLimitError } from "@/lib/errors";
import { jsonError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ id: string }> };

/**
 * Agent uploads a chat image for a specific conversation.
 * Media is scoped to the conversation's organization and the authenticated user.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { id: conversationId } = await params;

    const rl = checkRateLimit({
      key: `agent-upload:${auth.user.id}:${conversationId}`,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) throw new RateLimitError();

    const { conversation } = await requireOrgConversation(
      auth.user.id,
      conversationId,
    );

    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      throw new ValidationError("image file is required.");
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const stored = await storeImageAsset({
      organizationId: conversation.organizationId,
      kind: "chat",
      bytes: buf,
      maxBytes: MAX_CHAT_IMAGE_BYTES,
      visibility: "private",
      createdByUserId: auth.user.id,
      originalFilename: file.name,
      claimedMime: file.type,
    });

    return NextResponse.json({
      mediaId: stored.id,
      mediaUrl: stored.publicPath,
      mimeType: stored.mimeType,
      byteSize: stored.byteSize,
    });
  } catch (error) {
    return jsonError(error);
  }
}
