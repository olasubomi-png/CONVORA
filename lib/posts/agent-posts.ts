import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { agentPosts, agentProfiles, memberships } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import { AuthorizationError, NotFoundError } from "@/lib/errors";
import { getActiveMembership } from "@/lib/authz/membership";
import { isAdminRole } from "@/lib/authz/roles";

type CreatePostInput = {
  body: string;
  type?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LINK";
  mediaUrl?: string | null;
  visibility?: "DRAFT" | "PUBLIC" | "ARCHIVED";
};

export async function createAgentPost(
  actorUserId: string,
  agentProfileId: string,
  input: CreatePostInput,
) {
  const db = getDatabase();
  const rows = await db
    .select({
      profileId: agentProfiles.id,
      membershipUserId: memberships.userId,
      organizationId: memberships.organizationId,
      membershipStatus: memberships.status,
    })
    .from(agentProfiles)
    .innerJoin(memberships, eq(agentProfiles.membershipId, memberships.id))
    .where(eq(agentProfiles.id, agentProfileId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new NotFoundError("Agent profile not found.");

  const isOwner =
    row.membershipUserId === actorUserId && row.membershipStatus === "ACTIVE";
  if (!isOwner) {
    const actor = await getActiveMembership(actorUserId, row.organizationId);
    if (!actor || !isAdminRole(actor.role)) {
      throw new AuthorizationError("You cannot create posts for this profile.");
    }
  }

  const visibility = input.visibility ?? "DRAFT";
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
    organizationId: row.organizationId,
    payload: { postId: post.id, visibility },
  });

  return post;
}

export async function setAgentPostVisibility(
  actorUserId: string,
  postId: string,
  visibility: "DRAFT" | "PUBLIC" | "ARCHIVED",
) {
  const db = getDatabase();
  const rows = await db
    .select({
      post: agentPosts,
      membershipUserId: memberships.userId,
      organizationId: memberships.organizationId,
      membershipStatus: memberships.status,
    })
    .from(agentPosts)
    .innerJoin(agentProfiles, eq(agentPosts.agentProfileId, agentProfiles.id))
    .innerJoin(memberships, eq(agentProfiles.membershipId, memberships.id))
    .where(eq(agentPosts.id, postId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new NotFoundError("Post not found.");

  const isOwner =
    row.membershipUserId === actorUserId && row.membershipStatus === "ACTIVE";
  if (!isOwner) {
    const actor = await getActiveMembership(actorUserId, row.organizationId);
    if (!actor || !isAdminRole(actor.role)) {
      throw new AuthorizationError("You cannot modify this post.");
    }
  }

  const [updated] = await db
    .update(agentPosts)
    .set({
      visibility,
      publishedAt:
        visibility === "PUBLIC"
          ? row.post.publishedAt ?? new Date()
          : row.post.publishedAt,
      updatedAt: new Date(),
    })
    .where(eq(agentPosts.id, postId))
    .returning();

  await recordAuditEvent({
    eventType:
      visibility === "PUBLIC"
        ? "AGENT_POST_PUBLISHED"
        : visibility === "ARCHIVED"
          ? "AGENT_POST_ARCHIVED"
          : "AGENT_POST_CREATED",
    actorUserId: actorUserId,
    organizationId: row.organizationId,
    payload: { postId, visibility },
  });

  return updated;
}

export async function listPostsForProfile(agentProfileId: string) {
  const db = getDatabase();
  return db
    .select()
    .from(agentPosts)
    .where(eq(agentPosts.agentProfileId, agentProfileId));
}
