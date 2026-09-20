import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { conversations } from "./conversations";
import { memberships } from "./memberships";
import { customers } from "./customers";

export const messageSenderTypeEnum = pgEnum("message_sender_type", [
  "MEMBERSHIP",
  "CUSTOMER",
  "SYSTEM",
]);

export const messageTypeEnum = pgEnum("message_type", ["TEXT", "SYSTEM"]);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderType: messageSenderTypeEnum("sender_type").notNull(),
    senderMembershipId: uuid("sender_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    senderCustomerId: uuid("sender_customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    messageType: messageTypeEnum("message_type").notNull().default("TEXT"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("messages_conversation_id_idx").on(t.conversationId),
    index("messages_conversation_created_idx").on(t.conversationId, t.createdAt),
    check(
      "messages_sender_identity_check",
      sql`(
        (${t.senderType} = 'MEMBERSHIP' AND ${t.senderMembershipId} IS NOT NULL) OR
        (${t.senderType} = 'CUSTOMER' AND ${t.senderCustomerId} IS NOT NULL) OR
        (${t.senderType} = 'SYSTEM' AND ${t.senderMembershipId} IS NULL AND ${t.senderCustomerId} IS NULL)
      )`,
    ),
  ],
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type MessageSenderType = (typeof messageSenderTypeEnum.enumValues)[number];
export type MessageType = (typeof messageTypeEnum.enumValues)[number];
