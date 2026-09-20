import {
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { conversations } from "./conversations";

export const conversationTags = pgTable(
  "conversation_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("conversation_tags_org_slug_unique").on(t.organizationId, t.slug),
    index("conversation_tags_organization_id_idx").on(t.organizationId),
  ],
);

export const conversationTagLinks = pgTable(
  "conversation_tag_links",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => conversationTags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.tagId] }),
    index("conversation_tag_links_tag_id_idx").on(t.tagId),
  ],
);

export type ConversationTag = typeof conversationTags.$inferSelect;
export type NewConversationTag = typeof conversationTags.$inferInsert;
export type ConversationTagLink = typeof conversationTagLinks.$inferSelect;
