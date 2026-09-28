import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import {
  requireVisitorSession,
} from "@/lib/web-chat/visitor";
import {
  MAX_AVATAR_BYTES,
  storeImageAsset,
} from "@/lib/storage";
import {
  AuthorizationError,
  RateLimitError,
  ValidationError,
} from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { getDatabase } from "@/db";
import { customers } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Upload a customer/visitor profile photo for the authenticated visitor session.
 * Stores public media and updates customers.avatarUrl.
 */
export async function POST(request: Request) {
  try {
    const token =
      request.headers.get("x-convora-visitor-token")?.trim() ?? "";
    if (!token) throw new AuthorizationError("Visitor session is required.");

    const rl = checkRateLimit({
      key: `wc:avatar:${token.slice(0, 24)}`,
      limit: 10,
      windowMs: 60_000,
    });
    if (!rl.allowed) throw new RateLimitError();

    const { visitor } = await requireVisitorSession(token);
    if (!visitor.customerId) {
      throw new ValidationError(
        "Please save your name before uploading a photo.",
      );
    }

    const form = await request.formData();
    const file = form.get("avatar");
    if (!(file instanceof File)) {
      throw new ValidationError("avatar file is required.");
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const stored = await storeImageAsset({
      organizationId: visitor.organizationId,
      kind: "avatar",
      bytes: buf,
      maxBytes: MAX_AVATAR_BYTES,
      visibility: "public",
      createdByVisitorId: visitor.id,
      originalFilename: file.name,
      claimedMime: file.type,
    });

    const db = getDatabase();
    await db
      .update(customers)
      .set({ avatarUrl: stored.publicPath, updatedAt: new Date() })
      .where(
        and(
          eq(customers.id, visitor.customerId),
          eq(customers.organizationId, visitor.organizationId),
        ),
      );

    return NextResponse.json({
      avatarUrl: stored.publicPath,
      mediaId: stored.id,
    });
  } catch (error) {
    return jsonError(error);
  }
}
