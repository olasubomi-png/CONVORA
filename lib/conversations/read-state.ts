import { getDatabase } from "@/db";
import { conversationReadState, messages } from "@/db/schema";
import { requireOrgConversation } from "@/lib/conversations/access";
import { desc, eq } from "drizzle-orm";

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

  if (!lastReadMessageId) {
    const latest = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    lastReadMessageId = latest[0]?.id ?? null;
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
