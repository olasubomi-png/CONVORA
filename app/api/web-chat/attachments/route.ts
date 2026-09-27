import { NextResponse } from "next/server";
import { MAX_CHAT_IMAGE_BYTES, storeImageAsset } from "@/lib/storage";
import { jsonError } from "@/lib/api/response";
import { ValidationError, RateLimitError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { getDatabase } from "@/db";
import { webChatInstallations, webChatVisitors } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";

/**
 * Visitor image upload for Web Chat.
 * Requires valid session token + public key; returns media path for message send.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const publicKey = String(form.get("publicKey") ?? "");
    const sessionToken = String(form.get("sessionToken") ?? "");
    const file = form.get("image");
    if (!(file instanceof File)) {
      throw new ValidationError("image file is required.");
    }
    if (!publicKey || !sessionToken) {
      throw new ValidationError("publicKey and sessionToken are required.");
    }

    const db = getDatabase();
    const [installation] = await db
      .select()
      .from(webChatInstallations)
      .where(
        and(
          eq(webChatInstallations.publicKey, publicKey),
          eq(webChatInstallations.status, "ACTIVE"),
        ),
      )
      .limit(1);
    if (!installation) {
      throw new ValidationError("Invalid Web Chat installation.");
    }

    const tokenHash = createHash("sha256").update(sessionToken).digest("hex");
    const [visitor] = await db
      .select()
      .from(webChatVisitors)
      .where(
        and(
          eq(webChatVisitors.sessionTokenHash, tokenHash),
          eq(webChatVisitors.organizationId, installation.organizationId),
        ),
      )
      .limit(1);
    if (!visitor || visitor.expiresAt < new Date()) {
      throw new ValidationError("Invalid or expired visitor session.");
    }

    const rl = checkRateLimit({
      key: `wc-upload:${visitor.organizationId}:${visitor.id}`,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) throw new RateLimitError();

    const buf = Buffer.from(await file.arrayBuffer());
    const stored = await storeImageAsset({
      organizationId: installation.organizationId,
      kind: "chat",
      bytes: buf,
      maxBytes: MAX_CHAT_IMAGE_BYTES,
      visibility: "private",
      createdByVisitorId: visitor.id,
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
