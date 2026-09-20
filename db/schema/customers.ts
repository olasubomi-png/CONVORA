import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";

export const customerStatusEnum = pgEnum("customer_status", [
  "ACTIVE",
  "MERGED",
]);

/**
 * Organization-scoped external contact.
 * Email: trimmed + lowercased before storage; unique per org among ACTIVE rows.
 * MERGED customers are retired and excluded from normal lists.
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
    internalSummary: text("internal_summary"),
    status: customerStatusEnum("status").notNull().default("ACTIVE"),
    mergedIntoCustomerId: uuid("merged_into_customer_id"),
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
    index("customers_org_status_idx").on(t.organizationId, t.status),
    uniqueIndex("customers_org_email_unique")
      .on(t.organizationId, t.email)
      .where(sql`${t.email} IS NOT NULL AND ${t.status} = 'ACTIVE'`),
    uniqueIndex("customers_org_id_unique").on(t.organizationId, t.id),
    foreignKey({
      columns: [t.mergedIntoCustomerId],
      foreignColumns: [t.id],
      name: "customers_merged_into_customer_id_fk",
    }).onDelete("set null"),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type CustomerStatus = (typeof customerStatusEnum.enumValues)[number];
