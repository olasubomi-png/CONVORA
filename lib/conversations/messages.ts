import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import { messages, conversations } from "@/db/schema";
import { requireOrgConversation } from "@/lib/conversations/access";
import { ValidationError } from "@/lib/errors";
import {
  decodeTimeIdCursor,
  encodeTimeIdCursor,
} from "@/lib/conversations/cursors";
import {
  enqueueAutomationEvent,
  flushAutomationEvents,
} from "@/lib/automation/dispatch";

const PAGE_SIZE = 50;
const MAX_PAGE = 100;

export async function sendAgentMessage(
  actorUserId: string,
  conversationId: string,
  body: string,
) {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new ValidationError("Message body is required.");
  }

  const { conversation, membership } = await requireOrgConversation(
    actorUserId,
    conversationId,
  );

  if (conversation.status === "CLOSED") {
    throw new ValidationError("Cannot send messages to a closed conversation.");
  }

  // Membership already verified active + same org via requireOrgConversation
  const db = getDatabase();
  const message = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(messages)
      .values({
        conversationId,
        senderType: "MEMBERSHIP",
        senderMembershipId: membership.id,
        body: trimmed,
        messageType: "TEXT",
      })
      .returning();
    if (!row) throw new Error("Failed to create message");

    await tx
      .update(conversations)
      .set({ lastMessageAt: row.createdAt, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    await enqueueAutomationEvent(
      {
        organizationId: conversation.organizationId,
        triggerType: "conversation.message_sent",
        eventKey: `message:${row.id}:sent`,
        payload: {
          conversationId,
          message: { direction: "outbound", body: trimmed.slice(0, 200) },
        },
      },
      tx,
    );

    return row;
  });

  await flushAutomationEvents(conversation.organizationId);
  return message;
}

/**
 * Deterministic cursor pagination on (createdAt, id).
 *
 * Default: latest page in chronological order for display.
 * before: older messages
 * after: newer messages
 */
export async function listMessages(
  actorUserId: string,
  conversationId: string,
  options?: { before?: string; after?: string; limit?: number },
) {
  await requireOrgConversation(actorUserId, conversationId);

  if (options?.before && options?.after) {
    throw new ValidationError("Specify only one of before or after.");
  }

  const limit = Math.min(
    Math.max(1, options?.limit ?? PAGE_SIZE),
    MAX_PAGE,
  );
  const db = getDatabase();

  const base = and(
    eq(messages.conversationId, conversationId),
    isNull(messages.deletedAt),
  );

  if (options?.before) {
    const cursor = decodeTimeIdCursor(options.before);
    const tIso = cursor.createdAt.toISOString();
    const rows = await db
      .select()
      .from(messages)
      .where(
        and(
          base,
          or(
            sql`${messages.createdAt} < ${tIso}::timestamptz`,
            and(
              sql`${messages.createdAt} = ${tIso}::timestamptz`,
              sql`${messages.id} < ${cursor.id}::uuid`,
            ),
          ),
        ),
      )
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(limit);

    const ordered = rows.reverse();
    return {
      messages: ordered,
      nextCursor:
        ordered.length === limit && ordered[0]
          ? encodeTimeIdCursor(ordered[0].createdAt, ordered[0].id)
          : null,
      prevCursor:
        ordered.length > 0
          ? encodeTimeIdCursor(
              ordered[ordered.length - 1]!.createdAt,
              ordered[ordered.length - 1]!.id,
            )
          : null,
    };
  }

  if (options?.after) {
    const cursor = decodeTimeIdCursor(options.after);
    const tIso = cursor.createdAt.toISOString();
    const rows = await db
      .select()
      .from(messages)
      .where(
        and(
          base,
          or(
            sql`${messages.createdAt} > ${tIso}::timestamptz`,
            and(
              sql`${messages.createdAt} = ${tIso}::timestamptz`,
              sql`${messages.id} > ${cursor.id}::uuid`,
            ),
          ),
        ),
      )
      .orderBy(asc(messages.createdAt), asc(messages.id))
      .limit(limit);

    return {
      messages: rows,
      nextCursor:
        rows.length === limit && rows[rows.length - 1]
          ? encodeTimeIdCursor(
              rows[rows.length - 1]!.createdAt,
              rows[rows.length - 1]!.id,
            )
          : null,
      prevCursor:
        rows[0] != null
          ? encodeTimeIdCursor(rows[0].createdAt, rows[0].id)
          : null,
    };
  }

  // Default: latest page, chronological for display
  const rows = await db
    .select()
    .from(messages)
    .where(base)
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit);
  const ordered = rows.reverse();
  return {
    messages: ordered,
    nextCursor:
      ordered.length === limit && ordered[0]
        ? encodeTimeIdCursor(ordered[0].createdAt, ordered[0].id)
        : null,
    prevCursor:
      ordered.length > 0
        ? encodeTimeIdCursor(
            ordered[ordered.length - 1]!.createdAt,
            ordered[ordered.length - 1]!.id,
          )
        : null,
  };
}
