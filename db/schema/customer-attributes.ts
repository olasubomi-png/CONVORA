import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  index,
  primaryKey,
  foreignKey,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { customers } from "./customers";

export const customerAttributeTypeEnum = pgEnum("customer_attribute_type", [
  "TEXT",
  "NUMBER",
  "BOOLEAN",
  "DATE",
  "SELECT",
]);

export const customerAttributeDefinitions = pgTable(
  "customer_attribute_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: customerAttributeTypeEnum("type").notNull(),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("customer_attr_defs_org_key_unique").on(
      t.organizationId,
      t.key,
    ),
    index("customer_attr_defs_organization_id_idx").on(t.organizationId),
    uniqueIndex("customer_attr_defs_org_id_unique").on(t.organizationId, t.id),
  ],
);

export const customerAttributeValues = pgTable(
  "customer_attribute_values",
  {
    customerId: uuid("customer_id").notNull(),
    definitionId: uuid("definition_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    valueText: text("value_text"),
    valueNumber: text("value_number"),
    valueBoolean: text("value_boolean"),
    valueDate: timestamp("value_date", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.customerId, t.definitionId] }),
    index("customer_attr_values_definition_id_idx").on(t.definitionId),
    index("customer_attr_values_organization_id_idx").on(t.organizationId),
    foreignKey({
      columns: [t.organizationId, t.customerId],
      foreignColumns: [customers.organizationId, customers.id],
      name: "customer_attr_values_customer_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.organizationId, t.definitionId],
      foreignColumns: [
        customerAttributeDefinitions.organizationId,
        customerAttributeDefinitions.id,
      ],
      name: "customer_attr_values_definition_org_fk",
    }).onDelete("cascade"),
  ],
);

export type CustomerAttributeDefinition =
  typeof customerAttributeDefinitions.$inferSelect;
export type CustomerAttributeValue =
  typeof customerAttributeValues.$inferSelect;
export type CustomerAttributeType =
  (typeof customerAttributeTypeEnum.enumValues)[number];
