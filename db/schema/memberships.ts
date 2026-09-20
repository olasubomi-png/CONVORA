import { pgEnum, pgTable, timestamp, uuid, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

export const membershipRoleEnum = pgEnum("membership_role", ["OWNER", "ADMIN", "AGENT"]);
export const membershipStatusEnum = pgEnum("membership_status", ["ACTIVE", "INVITED", "SUSPENDED", "REMOVED"]);

export const memberships = pgTable("memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: membershipRoleEnum("role").notNull(),
  status: membershipStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("memberships_org_user_unique").on(t.organizationId, t.userId),
  uniqueIndex("memberships_one_owner_per_org").on(t.organizationId).where(sql`${t.role} = 'OWNER' AND ${t.status} <> 'REMOVED'`),
  index("memberships_user_id_idx").on(t.userId),
  index("memberships_organization_id_idx").on(t.organizationId),
]);

export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type MembershipRole = (typeof membershipRoleEnum.enumValues)[number];
export type MembershipStatus = (typeof membershipStatusEnum.enumValues)[number];
