import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { customers } from "./customers";
import { memberships } from "./memberships";

export const conversationStatusEnum = pgEnum("conversation_status", [
  "OPEN",
  "PENDING",
  "CLOSED",
]);

export const conversationPriorityEnum = pgEnum("conversation_priority", [
  "NORMAL",
  "HIGH",
  "URGENT",
]);

/**
 * Channel is a source label only — integrations are future phases.
 */
export const conversationChannelEnum = pgEnum("conversation_channel", [
  "WEB",
  "WHATSAPP",
  "FACEBOOK",
  "INSTAGRAM",
  "EMAIL",
  "SMS",
  "OTHER",
]);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    subject: text("subject"),
    status: conversationStatusEnum("status").notNull().default("OPEN"),
    priority: conversationPriorityEnum("priority").notNull().default("NORMAL"),
    channel: conversationChannelEnum("channel").notNull().default("WEB"),
    /** Denormalized current assignee for inbox queries; history in conversation_assignments. */
    assignedToMembershipId: uuid("assigned_to_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("conversations_organization_id_idx").on(t.organizationId),
    uniqueIndex("conversations_org_id_unique").on(t.organizationId, t.id),
    index("conversations_org_status_idx").on(t.organizationId, t.status),
    index("conversations_org_last_message_idx").on(
      t.organizationId,
      t.lastMessageAt,
    ),
    index("conversations_customer_id_idx").on(t.customerId),
    index("conversations_assigned_membership_idx").on(t.assignedToMembershipId),
    index("conversations_org_created_idx").on(t.organizationId, t.createdAt),
    index("conversations_org_closed_idx").on(t.organizationId, t.closedAt),
    index("conversations_org_channel_created_idx").on(
      t.organizationId,
      t.channel,
      t.createdAt,
    ),
  ],
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type ConversationStatus = (typeof conversationStatusEnum.enumValues)[number];
export type ConversationPriority = (typeof conversationPriorityEnum.enumValues)[number];
export type ConversationChannel = (typeof conversationChannelEnum.enumValues)[number];
