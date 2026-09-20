import { pgTable, timestamp, uuid, primaryKey, index } from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { conversationTags } from "./conversation-tags";

/**
 * Links customers to organization-scoped tags (conversation_tags table
 * is the org tag catalog shared with conversations).
 */
export const customerTagLinks = pgTable(
  "customer_tag_links",
  {
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => conversationTags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.customerId, t.tagId] }),
    index("customer_tag_links_tag_id_idx").on(t.tagId),
  ],
);

export type CustomerTagLink = typeof customerTagLinks.$inferSelect;
