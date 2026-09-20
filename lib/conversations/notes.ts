import { asc, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { conversationNotes } from "@/db/schema";
import { requireOrgConversation } from "@/lib/conversations/access";
import { recordAuditEvent } from "@/lib/audit";
import { ValidationError } from "@/lib/errors";

export async function addInternalNote(
  actorUserId: string,
  conversationId: string,
  body: string,
) {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new ValidationError("Note body is required.");
  }

  const { conversation, membership } = await requireOrgConversation(
    actorUserId,
    conversationId,
  );

  const db = getDatabase();
  const [note] = await db
    .insert(conversationNotes)
    .values({
      conversationId,
      authorMembershipId: membership.id,
      body: trimmed,
    })
    .returning();
  if (!note) throw new Error("Failed to create note");

  await recordAuditEvent({
    eventType: "CONVERSATION_NOTE_CREATED",
    actorUserId,
    organizationId: conversation.organizationId,
    payload: { conversationId, noteId: note.id },
  });

  return note;
}

export async function listInternalNotes(
  actorUserId: string,
  conversationId: string,
) {
  await requireOrgConversation(actorUserId, conversationId);
  const db = getDatabase();
  return db
    .select()
    .from(conversationNotes)
    .where(eq(conversationNotes.conversationId, conversationId))
    .orderBy(asc(conversationNotes.createdAt));
}
