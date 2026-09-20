import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { customers } from "./customers";
import { conversations } from "./conversations";
import { messages } from "./messages";

export const channelInstallationStatusEnum = pgEnum(
  "channel_installation_status",
  ["ACTIVE", "DISABLED", "ERROR"],
);

export const channelInboundEventStatusEnum = pgEnum(
  "channel_inbound_event_status",
  ["PROCESSING", "PROCESSED", "FAILED"],
);

export const channelDeliveryStatusEnum = pgEnum("channel_delivery_status", [
  "PENDING",
  "SENDING",
  "SENT",
  "FAILED",
]);

/**
 * Organization connection to an external channel provider.
 * Secrets live in encryptedConfig (never returned to clients).
 */
export const channelInstallations = pgTable(
  "channel_installations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Matches conversation_channel enum values. */
    channel: text("channel").notNull(),
    provider: text("provider").notNull(),
    displayName: text("display_name").notNull(),
    status: channelInstallationStatusEnum("status").notNull().default("ACTIVE"),
    /**
     * Provider-specific public resource id for webhook routing
     * (e.g. WhatsApp phone_number_id). Unique per provider when set.
     */
    providerResourceId: text("provider_resource_id"),
    /** Non-secret public metadata (webhook path key, app id display, etc.) */
    publicConfig: jsonb("public_config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /**
     * Sensitive credentials. Stored server-side only.
     * Phase 7 stores opaque JSON; production encryption is a later phase.
     */
    encryptedConfig: jsonb("encrypted_config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("channel_installations_organization_id_idx").on(t.organizationId),
    uniqueIndex("channel_installations_org_id_unique").on(
      t.organizationId,
      t.id,
    ),
    uniqueIndex("channel_installations_org_channel_provider_name_unique").on(
      t.organizationId,
      t.channel,
      t.provider,
      t.displayName,
    ),
    uniqueIndex("channel_installations_provider_resource_unique")
      .on(t.provider, t.providerResourceId)
      .where(sql`${t.providerResourceId} IS NOT NULL`),
    index("channel_installations_provider_resource_idx").on(
      t.provider,
      t.providerResourceId,
    ),
  ],
);

/**
 * Maps external provider identities to organization-scoped customers.
 */
export const customerChannelIdentities = pgTable(
  "customer_channel_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    channel: text("channel").notNull(),
    provider: text("provider").notNull(),
    externalUserId: text("external_user_id").notNull(),
    externalUsername: text("external_username"),
    externalAddress: text("external_address"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("customer_channel_identities_organization_id_idx").on(
      t.organizationId,
    ),
    index("customer_channel_identities_customer_id_idx").on(t.customerId),
    uniqueIndex("customer_channel_identities_org_provider_ext_unique").on(
      t.organizationId,
      t.provider,
      t.externalUserId,
    ),
    foreignKey({
      columns: [t.organizationId, t.customerId],
      foreignColumns: [customers.organizationId, customers.id],
      name: "customer_channel_identities_customer_org_fk",
    }).onDelete("cascade"),
  ],
);

/**
 * Durable inbound provider event log for idempotency / replay protection.
 */
export const channelInboundEvents = pgTable(
  "channel_inbound_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    installationId: uuid("installation_id").notNull(),
    provider: text("provider").notNull(),
    externalEventId: text("external_event_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    status: channelInboundEventStatusEnum("status")
      .notNull()
      .default("PROCESSING"),
    errorMessage: text("error_message"),
    conversationId: uuid("conversation_id"),
    messageId: uuid("message_id"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("channel_inbound_events_org_provider_event_unique").on(
      t.organizationId,
      t.provider,
      t.externalEventId,
    ),
    index("channel_inbound_events_installation_id_idx").on(t.installationId),
    foreignKey({
      columns: [t.organizationId, t.installationId],
      foreignColumns: [
        channelInstallations.organizationId,
        channelInstallations.id,
      ],
      name: "channel_inbound_events_installation_org_fk",
    }).onDelete("cascade"),
  ],
);

/**
 * Outbound delivery attempts for agent/system messages to external channels.
 */
export const channelMessageDeliveries = pgTable(
  "channel_message_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    messageId: uuid("message_id").notNull(),
    installationId: uuid("installation_id").notNull(),
    channel: text("channel").notNull(),
    provider: text("provider").notNull(),
    externalMessageId: text("external_message_id"),
    status: channelDeliveryStatusEnum("status").notNull().default("PENDING"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("channel_message_deliveries_message_id_unique").on(t.messageId),
    index("channel_message_deliveries_organization_id_idx").on(
      t.organizationId,
    ),
    index("channel_message_deliveries_status_idx").on(t.status),
    foreignKey({
      columns: [t.organizationId, t.conversationId],
      foreignColumns: [conversations.organizationId, conversations.id],
      name: "channel_message_deliveries_conversation_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.messageId],
      foreignColumns: [messages.id],
      name: "channel_message_deliveries_message_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.organizationId, t.installationId],
      foreignColumns: [
        channelInstallations.organizationId,
        channelInstallations.id,
      ],
      name: "channel_message_deliveries_installation_org_fk",
    }).onDelete("cascade"),
  ],
);

export type ChannelInstallation = typeof channelInstallations.$inferSelect;
export type CustomerChannelIdentity =
  typeof customerChannelIdentities.$inferSelect;
export type ChannelInboundEvent = typeof channelInboundEvents.$inferSelect;
export type ChannelMessageDelivery =
  typeof channelMessageDeliveries.$inferSelect;
