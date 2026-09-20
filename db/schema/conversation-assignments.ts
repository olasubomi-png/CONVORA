import { pgTable, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { conversations } from "./conversations";
import { memberships } from "./memberships";

/**
 * Assignment history. At most one active assignment per conversation
 * (partial unique index where unassigned_at IS NULL).
 */
export const conversationAssignments = pgTable(
  "conversation_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    assignedByMembershipId: uuid("assigned_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    unassignedAt: timestamp("unassigned_at", { withTimezone: true }),
  },
  (t) => [
    index("conversation_assignments_conversation_id_idx").on(t.conversationId),
    index("conversation_assignments_membership_id_idx").on(t.membershipId),
    uniqueIndex("conversation_assignments_one_active")
      .on(t.conversationId)
      .where(sql`${t.unassignedAt} IS NULL`),
  ],
);

export type ConversationAssignment = typeof conversationAssignments.$inferSelect;
export type NewConversationAssignment = typeof conversationAssignments.$inferInsert;
