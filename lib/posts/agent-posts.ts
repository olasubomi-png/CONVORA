import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  agentPosts,
  agentProfiles,
  memberships,
  users,
  type AgentPostVisibility,
} from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";
import { getActiveMembership } from "@/lib/authz/membership";
import { isAdminRole } from "@/lib/authz/roles";
import {
  assertValidPostVisibilityTransition,
  nextPublishedAt,
} from "@/lib/posts/visibility";

type CreatePostInput = {
  body: string;
  type?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LINK";
  mediaUrl?: string | null;
  visibility?: AgentPostVisibility;
};

type PostAuthContext = {
  organizationId: string;
  membershipUserId: string;
};

async function authorizePostWrite(
  actorUserId: string,
  profileId: string,
): Promise<PostAuthContext> {
  const db = getDatabase();
  const rows = await db
    .select({
      profileId: agentProfiles.id,
      membershipUserId: memberships.userId,
      organizationId: memberships.organizationId,
      membershipStatus: memberships.status,
      userStatus: users.status,
    })
    .from(agentProfiles)
    .innerJoin(memberships, eq(agentProfiles.membershipId, memberships.id))
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(agentProfiles.id, profileId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new NotFoundError("Agent profile not found.");
  }

  // Profile owner's membership and user must be active for owner writes
  const isProfileOwner =
    row.membershipUserId === actorUserId &&
    row.membershipStatus === "ACTIVE" &&
    row.userStatus === "ACTIVE";

  if (isProfileOwner) {
    return {
      organizationId: row.organizationId,
      membershipUserId: row.membershipUserId,
    };
  }

  // Admin/owner in the same organization may moderate
  const actor = await getActiveMembership(actorUserId, row.organizationId);
  if (!actor || !isAdminRole(actor.role)) {
    // Non-disclosure across tenants / unauthorized actors
    throw new NotFoundError("Agent profile not found.");
  }

  return {
    organizationId: row.organizationId,
    membershipUserId: row.membershipUserId,
  };
}

async function authorizePostMutation(
  actorUserId: string,
  postId: string,
): Promise<{
  organizationId: string;
  postVisibility: AgentPostVisibility;
  publishedAt: Date | null;
}> {
  const db = getDatabase();
  const rows = await db
    .select({
      postId: agentPosts.id,
      visibility: agentPosts.visibility,
      publishedAt: agentPosts.publishedAt,
      membershipUserId: memberships.userId,
      organizationId: memberships.organizationId,
      membershipStatus: memberships.status,
      userStatus: users.status,
    })
    .from(agentPosts)
    .innerJoin(agentProfiles, eq(agentPosts.agentProfileId, agentProfiles.id))
    .innerJoin(memberships, eq(agentProfiles.membershipId, memberships.id))
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(agentPosts.id, postId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new NotFoundError("Post not found.");
  }

  const isProfileOwner =
    row.membershipUserId === actorUserId &&
    row.membershipStatus === "ACTIVE" &&
    row.userStatus === "ACTIVE";

  if (!isProfileOwner) {
    const actor = await getActiveMembership(actorUserId, row.organizationId);
    if (!actor || !isAdminRole(actor.role)) {
      throw new NotFoundError("Post not found.");
    }
  }

  return {
    organizationId: row.organizationId,
    postVisibility: row.visibility,
    publishedAt: row.publishedAt,
  };
}

export async function createAgentPost(
  actorUserId: string,
  agentProfileId: string,
  input: CreatePostInput,
) {
  const auth = await authorizePostWrite(actorUserId, agentProfileId);
  const visibility = input.visibility ?? "DRAFT";
  const db = getDatabase();

  const [post] = await db
    .insert(agentPosts)
    .values({
      agentProfileId,
      body: input.body,
      type: input.type ?? "TEXT",
      mediaUrl: input.mediaUrl || null,
      visibility,
      publishedAt: visibility === "PUBLIC" ? new Date() : null,
    })
    .returning();

  if (!post) throw new Error("Failed to create post");

  await recordAuditEvent({
    eventType:
      visibility === "PUBLIC" ? "AGENT_POST_PUBLISHED" : "AGENT_POST_CREATED",
    actorUserId: actorUserId,
    organizationId: auth.organizationId,
    payload: { postId: post.id, visibility },
  });

  return post;
}

export async function setAgentPostVisibility(
  actorUserId: string,
  postId: string,
  visibility: AgentPostVisibility,
) {
  const auth = await authorizePostMutation(actorUserId, postId);
  assertValidPostVisibilityTransition(auth.postVisibility, visibility);

  const publishedAt = nextPublishedAt(
    auth.postVisibility,
    visibility,
    auth.publishedAt,
  );

  const db = getDatabase();
  const [updated] = await db
    .update(agentPosts)
    .set({
      visibility,
      publishedAt,
      updatedAt: new Date(),
    })
    .where(eq(agentPosts.id, postId))
    .returning();

  if (!updated) {
    throw new NotFoundError("Post not found.");
  }

  await recordAuditEvent({
    eventType:
      visibility === "PUBLIC"
        ? "AGENT_POST_PUBLISHED"
        : visibility === "ARCHIVED"
          ? "AGENT_POST_ARCHIVED"
          : "AGENT_POST_CREATED",
    actorUserId: actorUserId,
    organizationId: auth.organizationId,
    payload: { postId, visibility },
  });

  return updated;
}

/**
 * List posts for a profile the actor is allowed to manage.
 * Not a public API — requires write authorization on the profile.
 */
export async function listPostsForProfile(
  actorUserId: string,
  agentProfileId: string,
) {
  await authorizePostWrite(actorUserId, agentProfileId);
  const db = getDatabase();
  return db
    .select()
    .from(agentPosts)
    .where(eq(agentPosts.agentProfileId, agentProfileId));
}
