import {
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { conversations } from "./conversations";
import { memberships } from "./memberships";
import { customers } from "./customers";

export const participantRoleEnum = pgEnum("participant_role", [
  "CUSTOMER",
  "AGENT",
]);

/**
 * Exactly one of membershipId or customerId must be set.
 */
export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").references(() => memberships.id, {
      onDelete: "cascade",
    }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "cascade",
    }),
    role: participantRoleEnum("role").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [
    index("conversation_participants_conversation_id_idx").on(t.conversationId),
    uniqueIndex("conversation_participants_membership_unique")
      .on(t.conversationId, t.membershipId)
      .where(sql`${t.membershipId} IS NOT NULL`),
    uniqueIndex("conversation_participants_customer_unique")
      .on(t.conversationId, t.customerId)
      .where(sql`${t.customerId} IS NOT NULL`),
    check(
      "conversation_participants_identity_check",
      sql`(${t.membershipId} IS NOT NULL AND ${t.customerId} IS NULL) OR (${t.membershipId} IS NULL AND ${t.customerId} IS NOT NULL)`,
    ),
  ],
);

export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type NewConversationParticipant = typeof conversationParticipants.$inferInsert;
export type ParticipantRole = (typeof participantRoleEnum.enumValues)[number];
