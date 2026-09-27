import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authz/context";
import { getUserOrganizationContexts } from "@/lib/authz/context";
import { getDatabase } from "@/db";
import { agentProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  MAX_AVATAR_BYTES,
  storeImageAsset,
  deleteMediaAsset,
} from "@/lib/storage";
import { ValidationError, NotFoundError } from "@/lib/errors";
import { jsonError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { RateLimitError } from "@/lib/errors";
import { recordAuditEvent } from "@/lib/audit";

/**
 * POST multipart form field "avatar" — upload/replace agent avatar for primary membership profile.
 * DELETE — remove avatar.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const rl = checkRateLimit({
      key: `avatar:${auth.user.id}`,
      limit: 20,
      windowMs: 60_000,
    });
    if (!rl.allowed) throw new RateLimitError();

    const form = await request.formData();
    const file = form.get("avatar");
    if (!(file instanceof File)) {
      throw new ValidationError("avatar file is required.");
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const membershipsList = await getUserOrganizationContexts(auth.user.id);
    const primary = membershipsList[0];
    if (!primary) throw new ValidationError("Create an organization first.");

    const stored = await storeImageAsset({
      organizationId: primary.organizationId,
      kind: "avatar",
      bytes: buf,
      maxBytes: MAX_AVATAR_BYTES,
      visibility: "public",
      createdByUserId: auth.user.id,
      originalFilename: file.name,
      claimedMime: file.type,
    });

    const db = getDatabase();
    const [profile] = await db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.membershipId, primary.id))
      .limit(1);

    if (!profile) {
      throw new NotFoundError("Create your agent profile first.");
    }

    // Best-effort delete previous media if path matches our media API
    const prev = profile.avatarUrl;
    if (prev?.startsWith("/api/media/")) {
      const prevId = prev.replace("/api/media/", "").split("?")[0];
      if (prevId) {
        try {
          await deleteMediaAsset(prevId);
        } catch {
          // ignore
        }
      }
    }

    await db
      .update(agentProfiles)
      .set({
        avatarUrl: stored.publicPath,
        updatedAt: new Date(),
      })
      .where(eq(agentProfiles.id, profile.id));

    await recordAuditEvent({
      eventType: "AGENT_PROFILE_UPDATED",
      actorUserId: auth.user.id,
      organizationId: primary.organizationId,
      payload: { profileId: profile.id, avatarUpdated: true },
    });

    return NextResponse.json({
      avatarUrl: stored.publicPath,
      mediaId: stored.id,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE() {
  try {
    const auth = await requireAuthenticatedUser();
    const membershipsList = await getUserOrganizationContexts(auth.user.id);
    const primary = membershipsList[0];
    if (!primary) throw new ValidationError("Create an organization first.");

    const db = getDatabase();
    const [profile] = await db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.membershipId, primary.id))
      .limit(1);
    if (!profile) throw new NotFoundError("Profile not found.");

    const prev = profile.avatarUrl;
    await db
      .update(agentProfiles)
      .set({ avatarUrl: null, updatedAt: new Date() })
      .where(eq(agentProfiles.id, profile.id));

    if (prev?.startsWith("/api/media/")) {
      const prevId = prev.replace("/api/media/", "").split("?")[0];
      if (prevId) {
        try {
          await deleteMediaAsset(prevId);
        } catch {
          // ignore
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
