import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
  uniqueIndex,
  foreignKey,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { customers } from "./customers";
import { conversations } from "./conversations";
import { messages } from "./messages";

export const webChatInstallationStatusEnum = pgEnum(
  "web_chat_installation_status",
  ["ACTIVE", "DISABLED"],
);

/**
 * Public embeddable installation. publicKey is an identifier, not a secret.
 */
export const webChatInstallations = pgTable(
  "web_chat_installations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    publicKey: text("public_key").notNull(),
    name: text("name").notNull(),
    status: webChatInstallationStatusEnum("status").notNull().default("ACTIVE"),
    /**
     * At most one default installation per organization (managed Profile Chat).
     * Enforced by partial unique index web_chat_installations_org_default_unique.
     */
    isDefault: boolean("is_default").notNull().default(false),
    allowedOrigins: jsonb("allowed_origins").$type<string[]>().notNull().default([]),
    config: jsonb("config")
      .$type<{
        displayName?: string;
        welcomeMessage?: string;
        launcherPosition?: "bottom-right" | "bottom-left";
        accentColor?: string;
        headerText?: string;
      }>()
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
    uniqueIndex("web_chat_installations_public_key_unique").on(t.publicKey),
    index("web_chat_installations_organization_id_idx").on(t.organizationId),
    uniqueIndex("web_chat_installations_org_id_unique").on(
      t.organizationId,
      t.id,
    ),
    uniqueIndex("web_chat_installations_org_default_unique")
      .on(t.organizationId)
      .where(sql`${t.isDefault} = true`),
  ],
);

/**
 * Anonymous visitor session. sessionTokenHash only; expiresAt enforced.
 * Default TTL: 30 days from creation / resume.
 */
export const webChatVisitors = pgTable(
  "web_chat_visitors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    installationId: uuid("installation_id").notNull(),
    sessionTokenHash: text("session_token_hash").notNull(),
    customerId: uuid("customer_id"),
    conversationId: uuid("conversation_id"),
    displayName: text("display_name"),
    email: text("email"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("web_chat_visitors_session_token_hash_unique").on(
      t.sessionTokenHash,
    ),
    index("web_chat_visitors_organization_id_idx").on(t.organizationId),
    index("web_chat_visitors_installation_id_idx").on(t.installationId),
    foreignKey({
      columns: [t.organizationId, t.installationId],
      foreignColumns: [
        webChatInstallations.organizationId,
        webChatInstallations.id,
      ],
      name: "web_chat_visitors_installation_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.organizationId, t.customerId],
      foreignColumns: [customers.organizationId, customers.id],
      name: "web_chat_visitors_customer_org_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.organizationId, t.conversationId],
      foreignColumns: [conversations.organizationId, conversations.id],
      name: "web_chat_visitors_conversation_org_fk",
    }).onDelete("set null"),
  ],
);

/**
 * Idempotency keys for visitor message creates.
 * Unique (conversation_id, client_message_id).
 */
export const webChatMessageIdempotency = pgTable(
  "web_chat_message_idempotency",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    clientMessageId: text("client_message_id").notNull(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("web_chat_msg_idem_conv_client_unique").on(
      t.conversationId,
      t.clientMessageId,
    ),
    foreignKey({
      columns: [t.organizationId, t.conversationId],
      foreignColumns: [conversations.organizationId, conversations.id],
      name: "web_chat_msg_idem_conversation_org_fk",
    }).onDelete("cascade"),
  ],
);

export type WebChatInstallation = typeof webChatInstallations.$inferSelect;
export type WebChatVisitor = typeof webChatVisitors.$inferSelect;
export type WebChatMessageIdempotency =
  typeof webChatMessageIdempotency.$inferSelect;
