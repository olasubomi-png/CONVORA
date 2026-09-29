import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { memberships } from "./memberships";
import { users } from "./users";
import { conversations } from "./conversations";
import { messages } from "./messages";
import { customers } from "./customers";

export const agentNotifications = pgTable(
  "agent_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    messageId: uuid("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    channel: text("channel"),
    dedupeKey: text("dedupe_key").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    pushSentAt: timestamp("push_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("agent_notifications_dedupe_unique").on(
      t.membershipId,
      t.dedupeKey,
    ),
    index("agent_notifications_membership_created_idx").on(
      t.membershipId,
      t.createdAt,
    ),
    index("agent_notifications_membership_unread_idx").on(
      t.membershipId,
      t.readAt,
    ),
  ],
);

export const notificationPreferences = pgTable("notification_preferences", {
  membershipId: uuid("membership_id")
    .primaryKey()
    .references(() => memberships.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  inAppEnabled: boolean("in_app_enabled").notNull().default(true),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  pushEnabled: boolean("push_enabled").notNull().default(true),
  soundEnabled: boolean("sound_enabled").notNull().default(true),
  emailDigestSeconds: integer("email_digest_seconds").notNull().default(120),
  /** Agent opted in to receive WhatsApp alerts on their personal number. */
  whatsappEnabled: boolean("whatsapp_enabled").notNull().default(false),
  /** E.164 phone number for agent WhatsApp alerts (e.g. +2348012345678). */
  whatsappPhoneE164: text("whatsapp_phone_e164"),
  /** Cooldown window before another WhatsApp alert for the same conversation. */
  whatsappDigestSeconds: integer("whatsapp_digest_seconds").notNull().default(120),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").references(() => memberships.id, {
      onDelete: "cascade",
    }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("push_subscriptions_endpoint_unique").on(t.endpoint),
    index("push_subscriptions_user_idx").on(t.userId),
  ],
);

export type AgentNotification = typeof agentNotifications.$inferSelect;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
