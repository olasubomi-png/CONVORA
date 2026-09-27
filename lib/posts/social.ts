import { and, count, desc, eq, isNull } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  agentPostComments,
  agentPostLikes,
  agentPosts,
  agentProfiles,
  memberships,
  users,
} from "@/db/schema";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { RateLimitError } from "@/lib/errors";

const MAX_COMMENT_LEN = 2000;

async function requirePublicPost(postId: string) {
  const db = getDatabase();
  const [row] = await db
    .select({
      id: agentPosts.id,
      visibility: agentPosts.visibility,
      profileId: agentPosts.agentProfileId,
      profileVisibility: agentProfiles.visibility,
      membershipStatus: memberships.status,
    })
    .from(agentPosts)
    .innerJoin(agentProfiles, eq(agentPosts.agentProfileId, agentProfiles.id))
    .innerJoin(memberships, eq(agentProfiles.membershipId, memberships.id))
    .where(eq(agentPosts.id, postId))
    .limit(1);
  if (
    !row ||
    row.visibility !== "PUBLIC" ||
    row.profileVisibility !== "PUBLIC" ||
    row.membershipStatus !== "ACTIVE"
  ) {
    throw new NotFoundError("Post not found.");
  }
  return row;
}

export async function likePost(userId: string, postId: string) {
  const rl = checkRateLimit({
    key: `post-like:${userId}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) throw new RateLimitError();

  await requirePublicPost(postId);
  const db = getDatabase();
  try {
    await db.insert(agentPostLikes).values({ postId, userId });
  } catch {
    // unique violation = already liked
  }
  return getPostEngagement(postId, userId);
}

export async function unlikePost(userId: string, postId: string) {
  await requirePublicPost(postId);
  const db = getDatabase();
  await db
    .delete(agentPostLikes)
    .where(
      and(eq(agentPostLikes.postId, postId), eq(agentPostLikes.userId, userId)),
    );
  return getPostEngagement(postId, userId);
}

export async function addComment(
  userId: string,
  postId: string,
  body: string,
) {
  const rl = checkRateLimit({
    key: `post-comment:${userId}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) throw new RateLimitError();

  const trimmed = body.trim();
  if (!trimmed) throw new ValidationError("Comment cannot be empty.");
  if (trimmed.length > MAX_COMMENT_LEN) {
    throw new ValidationError(`Comment max length is ${MAX_COMMENT_LEN}.`);
  }

  await requirePublicPost(postId);
  const db = getDatabase();
  const [row] = await db
    .insert(agentPostComments)
    .values({ postId, userId, body: trimmed })
    .returning();
  if (!row) throw new ValidationError("Failed to create comment.");
  return row;
}

export async function deleteComment(userId: string, commentId: string) {
  const db = getDatabase();
  const [row] = await db
    .select()
    .from(agentPostComments)
    .where(eq(agentPostComments.id, commentId))
    .limit(1);
  if (!row || row.deletedAt) throw new NotFoundError("Comment not found.");
  if (row.userId !== userId) {
    throw new AuthorizationError("You can only delete your own comments.");
  }
  await db
    .update(agentPostComments)
    .set({ deletedAt: new Date() })
    .where(eq(agentPostComments.id, commentId));
  return { ok: true };
}

export async function listComments(postId: string, limit = 50) {
  await requirePublicPost(postId);
  const db = getDatabase();
  const rows = await db
    .select({
      id: agentPostComments.id,
      body: agentPostComments.body,
      createdAt: agentPostComments.createdAt,
      userId: agentPostComments.userId,
      authorName: users.fullName,
    })
    .from(agentPostComments)
    .innerJoin(users, eq(agentPostComments.userId, users.id))
    .where(
      and(
        eq(agentPostComments.postId, postId),
        isNull(agentPostComments.deletedAt),
      ),
    )
    .orderBy(desc(agentPostComments.createdAt))
    .limit(Math.min(limit, 100));
  return rows;
}

export async function getPostEngagement(postId: string, viewerUserId?: string) {
  const db = getDatabase();
  const [likes] = await db
    .select({ c: count() })
    .from(agentPostLikes)
    .where(eq(agentPostLikes.postId, postId));
  const [comments] = await db
    .select({ c: count() })
    .from(agentPostComments)
    .where(
      and(
        eq(agentPostComments.postId, postId),
        isNull(agentPostComments.deletedAt),
      ),
    );

  let likedByMe = false;
  if (viewerUserId) {
    const [mine] = await db
      .select({ id: agentPostLikes.id })
      .from(agentPostLikes)
      .where(
        and(
          eq(agentPostLikes.postId, postId),
          eq(agentPostLikes.userId, viewerUserId),
        ),
      )
      .limit(1);
    likedByMe = Boolean(mine);
  }

  return {
    likeCount: Number(likes?.c ?? 0),
    commentCount: Number(comments?.c ?? 0),
    likedByMe,
  };
}

export async function getEngagementForPosts(
  postIds: string[],
  viewerUserId?: string,
): Promise<
  Record<string, { likeCount: number; commentCount: number; likedByMe: boolean }>
> {
  const result: Record<
    string,
    { likeCount: number; commentCount: number; likedByMe: boolean }
  > = {};
  for (const id of postIds) {
    result[id] = { likeCount: 0, commentCount: 0, likedByMe: false };
  }
  if (postIds.length === 0) return result;

  const { inArray } = await import("drizzle-orm");
  const db = getDatabase();

  const likeRows = await db
    .select({
      postId: agentPostLikes.postId,
      c: count(),
    })
    .from(agentPostLikes)
    .where(inArray(agentPostLikes.postId, postIds))
    .groupBy(agentPostLikes.postId);

  for (const r of likeRows) {
    if (result[r.postId]) result[r.postId]!.likeCount = Number(r.c);
  }

  const commentRows = await db
    .select({
      postId: agentPostComments.postId,
      c: count(),
    })
    .from(agentPostComments)
    .where(
      and(
        inArray(agentPostComments.postId, postIds),
        isNull(agentPostComments.deletedAt),
      ),
    )
    .groupBy(agentPostComments.postId);

  for (const r of commentRows) {
    if (result[r.postId]) result[r.postId]!.commentCount = Number(r.c);
  }

  if (viewerUserId) {
    const mine = await db
      .select({ postId: agentPostLikes.postId })
      .from(agentPostLikes)
      .where(
        and(
          inArray(agentPostLikes.postId, postIds),
          eq(agentPostLikes.userId, viewerUserId),
        ),
      );
    for (const m of mine) {
      if (result[m.postId]) result[m.postId]!.likedByMe = true;
    }
  }

  return result;
}
