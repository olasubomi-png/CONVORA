import {
  pgTable,
  timestamp,
  uuid,
  primaryKey,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { conversationTags } from "./conversation-tags";

/**
 * Customer ↔ org tag. organizationId is denormalized so the DB can enforce
 * customer.organizationId === tag.organizationId via composite FKs.
 */
export const customerTagLinks = pgTable(
  "customer_tag_links",
  {
    customerId: uuid("customer_id").notNull(),
    tagId: uuid("tag_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.customerId, t.tagId] }),
    index("customer_tag_links_tag_id_idx").on(t.tagId),
    index("customer_tag_links_organization_id_idx").on(t.organizationId),
    foreignKey({
      columns: [t.organizationId, t.customerId],
      foreignColumns: [customers.organizationId, customers.id],
      name: "customer_tag_links_customer_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.organizationId, t.tagId],
      foreignColumns: [conversationTags.organizationId, conversationTags.id],
      name: "customer_tag_links_tag_org_fk",
    }).onDelete("cascade"),
  ],
);

export type CustomerTagLink = typeof customerTagLinks.$inferSelect;
