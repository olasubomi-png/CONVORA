import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authz/context";
import { getDatabase } from "@/db";
import { agentProfiles, memberships, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  MAX_AVATAR_BYTES,
  storeImageAsset,
  deleteMediaAsset,
} from "@/lib/storage";
import { ValidationError, NotFoundError, AuthorizationError } from "@/lib/errors";
import { jsonError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { RateLimitError } from "@/lib/errors";
import { recordAuditEvent } from "@/lib/audit";

async function authorizeProfileOwnership(
  userId: string,
  profileId: string,
) {
  const db = getDatabase();
  const [row] = await db
    .select({
      profileId: agentProfiles.id,
      avatarUrl: agentProfiles.avatarUrl,
      membershipId: memberships.id,
      organizationId: memberships.organizationId,
      membershipStatus: memberships.status,
      membershipUserId: memberships.userId,
      orgStatus: organizations.status,
    })
    .from(agentProfiles)
    .innerJoin(memberships, eq(agentProfiles.membershipId, memberships.id))
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(eq(agentProfiles.id, profileId))
    .limit(1);

  if (!row) {
    throw new NotFoundError("Profile not found.");
  }
  if (row.membershipUserId !== userId) {
    throw new AuthorizationError("You cannot modify this profile.");
  }
  if (row.membershipStatus !== "ACTIVE" || row.orgStatus !== "ACTIVE") {
    throw new AuthorizationError("Membership is not active.");
  }
  return row;
}

/**
 * POST multipart: profileId + avatar file.
 * Explicit profile ownership — never uses memberships[0].
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
    const profileId = String(form.get("profileId") ?? "").trim();
    if (!profileId) {
      throw new ValidationError("profileId is required.");
    }
    const file = form.get("avatar");
    if (!(file instanceof File)) {
      throw new ValidationError("avatar file is required.");
    }

    const profile = await authorizeProfileOwnership(auth.user.id, profileId);
    const buf = Buffer.from(await file.arrayBuffer());

    const stored = await storeImageAsset({
      organizationId: profile.organizationId,
      kind: "avatar",
      bytes: buf,
      maxBytes: MAX_AVATAR_BYTES,
      visibility: "public",
      createdByUserId: auth.user.id,
      originalFilename: file.name,
      claimedMime: file.type,
    });

    const db = getDatabase();
    try {
      await db
        .update(agentProfiles)
        .set({
          avatarUrl: stored.publicPath,
          updatedAt: new Date(),
        })
        .where(eq(agentProfiles.id, profile.profileId));
    } catch (error) {
      try {
        await deleteMediaAsset(stored.id);
      } catch {
        // orphan cleanup
      }
      throw error;
    }

    // Delete previous avatar only after successful DB update
    const prev = profile.avatarUrl;
    if (prev?.startsWith("/api/media/")) {
      const prevId = prev.replace("/api/media/", "").split("?")[0];
      if (prevId && prevId !== stored.id) {
        try {
          await deleteMediaAsset(prevId);
        } catch {
          // best-effort
        }
      }
    }

    await recordAuditEvent({
      eventType: "AGENT_PROFILE_UPDATED",
      actorUserId: auth.user.id,
      organizationId: profile.organizationId,
      payload: { profileId: profile.profileId, avatarUpdated: true },
    });

    return NextResponse.json({
      avatarUrl: stored.publicPath,
      mediaId: stored.id,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const url = new URL(request.url);
    const profileId =
      url.searchParams.get("profileId") ??
      String((await request.formData().catch(() => new FormData())).get("profileId") ?? "");
    if (!profileId) {
      throw new ValidationError("profileId is required.");
    }

    const profile = await authorizeProfileOwnership(auth.user.id, profileId);
    const db = getDatabase();
    await db
      .update(agentProfiles)
      .set({ avatarUrl: null, updatedAt: new Date() })
      .where(eq(agentProfiles.id, profile.profileId));

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

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
