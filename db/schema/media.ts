import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Uploaded media metadata. Binary bytes live on the configured storage backend.
 * Chat media may bind to a visitor and is single-use once consumed by a message.
 */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    /** avatar | post | chat */
    kind: text("kind").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    storageKey: text("storage_key").notNull(),
    /** public | private */
    visibility: text("visibility").notNull().default("private"),
    originalFilename: text("original_filename"),
    width: integer("width"),
    height: integer("height"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Web Chat visitor that uploaded this asset (chat only) */
    createdByVisitorId: uuid("created_by_visitor_id"),
    /** Set when attached to a message — prevents reuse on another message */
    consumedByMessageId: uuid("consumed_by_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("media_assets_storage_key_unique").on(t.storageKey),
    index("media_assets_organization_id_idx").on(t.organizationId),
    index("media_assets_created_by_visitor_id_idx").on(t.createdByVisitorId),
  ],
);

export type MediaAsset = typeof mediaAssets.$inferSelect;
