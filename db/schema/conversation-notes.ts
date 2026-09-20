import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { memberships } from "./memberships";

/** Staff-only notes — never exposed on customer-facing surfaces. */
export const conversationNotes = pgTable(
  "conversation_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    authorMembershipId: uuid("author_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("conversation_notes_conversation_id_idx").on(t.conversationId),
  ],
);

export type ConversationNote = typeof conversationNotes.$inferSelect;
export type NewConversationNote = typeof conversationNotes.$inferInsert;
