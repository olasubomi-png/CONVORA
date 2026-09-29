import {
  integer,
  jsonb,
  pgEnum,
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
import { agentNotifications } from "./notifications";
import { conversations } from "./conversations";
import { customers } from "./customers";

export const notificationDeliveryChannelEnum = pgEnum(
  "notification_delivery_channel",
  ["PUSH", "EMAIL", "WHATSAPP"],
);

export const notificationDeliveryStatusEnum = pgEnum(
  "notification_delivery_status",
  ["PENDING", "PROCESSING", "SENT", "FAILED", "CANCELLED"],
);

export type NotificationDeliveryPayload = {
  customerName?: string;
  organizationName?: string;
  channelLabel?: string;
  preview?: string;
  conversationUrl?: string;
  messageCount?: number;
  messageId?: string;
  /** Recipient phone for WHATSAPP channel (E.164). Never contains tokens. */
  toPhoneE164?: string;
};

/**
 * Durable per-channel delivery outbox for push/email.
 * Independent of in-app agent_notifications rows.
 */
export const notificationDeliveries = pgTable(
  "notification_deliveries",
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
    notificationId: uuid("notification_id").references(
      () => agentNotifications.id,
      { onDelete: "set null" },
    ),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    channel: notificationDeliveryChannelEnum("channel").notNull(),
    status: notificationDeliveryStatusEnum("status").notNull().default("PENDING"),
    dedupeKey: text("dedupe_key").notNull(),
    payload: jsonb("payload")
      .$type<NotificationDeliveryPayload>()
      .notNull()
      .default({}),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("notification_deliveries_dedupe_unique").on(
      t.membershipId,
      t.channel,
      t.dedupeKey,
    ),
    index("notification_deliveries_pending_idx").on(
      t.status,
      t.availableAt,
      t.createdAt,
    ),
    index("notification_deliveries_org_idx").on(t.organizationId, t.status),
  ],
);

export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
