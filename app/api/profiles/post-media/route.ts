import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authz/context";
import { getDatabase } from "@/db";
import { agentProfiles, memberships, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  MAX_POST_IMAGE_BYTES,
  storeImageAsset,
} from "@/lib/storage";
import {
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "@/lib/errors";
import { jsonError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Upload an image for an agent post. Requires explicit profile ownership.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const rl = checkRateLimit({
      key: `post-media:${auth.user.id}`,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) throw new RateLimitError();

    const form = await request.formData();
    const profileId = String(form.get("profileId") ?? "").trim();
    if (!profileId) throw new ValidationError("profileId is required.");
    const file = form.get("image");
    if (!(file instanceof File)) {
      throw new ValidationError("image file is required.");
    }

    const db = getDatabase();
    const [row] = await db
      .select({
        profileId: agentProfiles.id,
        organizationId: memberships.organizationId,
        membershipUserId: memberships.userId,
        membershipStatus: memberships.status,
        orgStatus: organizations.status,
      })
      .from(agentProfiles)
      .innerJoin(memberships, eq(agentProfiles.membershipId, memberships.id))
      .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
      .where(eq(agentProfiles.id, profileId))
      .limit(1);

    if (!row) throw new NotFoundError("Profile not found.");
    if (row.membershipUserId !== auth.user.id) {
      throw new AuthorizationError("You cannot upload media for this profile.");
    }
    if (row.membershipStatus !== "ACTIVE" || row.orgStatus !== "ACTIVE") {
      throw new AuthorizationError("Membership is not active.");
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const stored = await storeImageAsset({
      organizationId: row.organizationId,
      kind: "post",
      bytes: buf,
      maxBytes: MAX_POST_IMAGE_BYTES,
      visibility: "public",
      createdByUserId: auth.user.id,
      originalFilename: file.name,
      claimedMime: file.type,
    });

    return NextResponse.json({
      mediaId: stored.id,
      mediaUrl: stored.publicPath,
      mimeType: stored.mimeType,
    });
  } catch (error) {
    return jsonError(error);
  }
}
