import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * External person communicating with an organization.
 * Not a CONVORA member — no auth fields in Phase 3.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    avatarUrl: text("avatar_url"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("customers_organization_id_idx").on(t.organizationId),
    index("customers_org_email_idx").on(t.organizationId, t.email),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
