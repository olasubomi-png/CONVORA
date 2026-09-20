import { pgTable, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { memberships } from "./memberships";

/** Assignment history — current assignee also denormalized on conversations. */
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
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    unassignedAt: timestamp("unassigned_at", { withTimezone: true }),
  },
  (t) => [
    index("conversation_assignments_conversation_id_idx").on(t.conversationId),
    index("conversation_assignments_membership_id_idx").on(t.membershipId),
  ],
);

export type ConversationAssignment = typeof conversationAssignments.$inferSelect;
export type NewConversationAssignment = typeof conversationAssignments.$inferInsert;
