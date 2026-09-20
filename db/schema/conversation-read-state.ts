import { pgTable, timestamp, uuid, primaryKey } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { memberships } from "./memberships";
import { messages } from "./messages";

/** Per-membership unread state — not a shared conversation flag. */
export const conversationReadState = pgTable(
  "conversation_read_state",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    lastReadMessageId: uuid("last_read_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.membershipId] })],
);

export type ConversationReadState = typeof conversationReadState.$inferSelect;
export type NewConversationReadState = typeof conversationReadState.$inferInsert;
