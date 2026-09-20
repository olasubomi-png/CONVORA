import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { memberships } from "./memberships";

/** Staff-only customer notes — never customer-facing. */
export const customerNotes = pgTable(
  "customer_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    authorMembershipId: uuid("author_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("customer_notes_customer_id_idx").on(t.customerId)],
);

export type CustomerNote = typeof customerNotes.$inferSelect;
export type NewCustomerNote = typeof customerNotes.$inferInsert;
