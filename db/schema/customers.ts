import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";

/**
 * Organization-scoped external contact.
 * Identity uniqueness is per organization (email/phone), not global.
 * The same person may exist in multiple organizations as separate records.
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
    companyName: text("company_name"),
    jobTitle: text("job_title"),
    location: text("location"),
    /** Soft internal summary — detailed notes live in customer_notes. */
    internalSummary: text("internal_summary"),
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
    index("customers_organization_id_idx").on(t.organizationId),
    index("customers_org_email_idx").on(t.organizationId, t.email),
    index("customers_org_phone_idx").on(t.organizationId, t.phone),
    index("customers_org_name_idx").on(t.organizationId, t.displayName),
    index("customers_org_company_idx").on(t.organizationId, t.companyName),
    index("customers_org_created_idx").on(t.organizationId, t.createdAt),
    // Soft uniqueness: one non-null email per org
    uniqueIndex("customers_org_email_unique")
      .on(t.organizationId, t.email)
      .where(sql`${t.email} IS NOT NULL`),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
