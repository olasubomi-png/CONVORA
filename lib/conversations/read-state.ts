import { and, desc, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { conversationReadState, messages } from "@/db/schema";
import { requireOrgConversation } from "@/lib/conversations/access";
import { NotFoundError, ValidationError } from "@/lib/errors";

export async function markConversationRead(
  actorUserId: string,
  conversationId: string,
  messageId?: string,
) {
  const { membership } = await requireOrgConversation(
    actorUserId,
    conversationId,
  );

  const db = getDatabase();
  let lastReadMessageId = messageId ?? null;

  if (messageId) {
    const rows = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
      })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    const msg = rows[0];
    if (!msg || msg.conversationId !== conversationId) {
      // Non-disclosure: do not confirm whether the message exists elsewhere
      throw new NotFoundError("Message not found.");
    }
    lastReadMessageId = msg.id;
  } else {
    const latest = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
        ),
      )
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(1);
    lastReadMessageId = latest[0]?.id ?? null;
  }

  if (messageId && !lastReadMessageId) {
    throw new ValidationError("Message not found.");
  }

  await db
    .insert(conversationReadState)
    .values({
      conversationId,
      membershipId: membership.id,
      lastReadMessageId,
      lastReadAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        conversationReadState.conversationId,
        conversationReadState.membershipId,
      ],
      set: {
        lastReadMessageId,
        lastReadAt: new Date(),
      },
    });
}
