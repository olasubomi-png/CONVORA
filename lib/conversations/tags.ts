import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  conversationTags,
  conversationTagLinks,
} from "@/db/schema";
import { requireOrgConversation } from "@/lib/conversations/access";
import { recordAuditEvent } from "@/lib/audit";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db-errors";
import { normalizeSlug } from "@/lib/orgs/slug";
import { getActiveMembership } from "@/lib/authz/membership";
import { AuthorizationError } from "@/lib/errors";

export async function createOrganizationTag(
  actorUserId: string,
  organizationId: string,
  name: string,
) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }

  const slug = normalizeSlug(name);
  const db = getDatabase();
  try {
    const [tag] = await db
      .insert(conversationTags)
      .values({
        organizationId,
        name: name.trim(),
        slug,
      })
      .returning();
    if (!tag) throw new Error("Failed to create tag");
    return tag;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("A tag with this name already exists.");
    }
    throw error;
  }
}

export async function addConversationTag(
  actorUserId: string,
  conversationId: string,
  tagId: string,
) {
  const { conversation } = await requireOrgConversation(
    actorUserId,
    conversationId,
  );

  const db = getDatabase();
  const tagRows = await db
    .select()
    .from(conversationTags)
    .where(eq(conversationTags.id, tagId))
    .limit(1);
  const tag = tagRows[0];
  if (!tag || tag.organizationId !== conversation.organizationId) {
    throw new NotFoundError("Tag not found.");
  }

  try {
    await db.insert(conversationTagLinks).values({
      conversationId,
      tagId,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return tag; // already linked
    }
    throw error;
  }

  await recordAuditEvent({
    eventType: "CONVERSATION_TAG_ADDED",
    actorUserId,
    organizationId: conversation.organizationId,
    payload: { conversationId, tagId },
  });

  return tag;
}

export async function removeConversationTag(
  actorUserId: string,
  conversationId: string,
  tagId: string,
) {
  const { conversation } = await requireOrgConversation(
    actorUserId,
    conversationId,
  );

  const db = getDatabase();
  await db
    .delete(conversationTagLinks)
    .where(
      and(
        eq(conversationTagLinks.conversationId, conversationId),
        eq(conversationTagLinks.tagId, tagId),
      ),
    );

  await recordAuditEvent({
    eventType: "CONVERSATION_TAG_REMOVED",
    actorUserId,
    organizationId: conversation.organizationId,
    payload: { conversationId, tagId },
  });
}

export async function listOrganizationTags(
  actorUserId: string,
  organizationId: string,
) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }
  const db = getDatabase();
  return db
    .select()
    .from(conversationTags)
    .where(eq(conversationTags.organizationId, organizationId));
}
