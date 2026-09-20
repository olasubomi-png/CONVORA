import {
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { profileVisibilityEnum, verificationStatusEnum } from "./agent-profiles";

/**
 * Public-facing organization identity (1:1 with organizations).
 * Does not replace the organizations table.
 */
export const organizationProfiles = pgTable(
  "organization_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    legalName: text("legal_name"),
    logoUrl: text("logo_url"),
    bannerUrl: text("banner_url"),
    description: text("description"),
    websiteUrl: text("website_url"),
    publicEmail: text("public_email"),
    publicPhone: text("public_phone"),
    location: text("location"),
    serviceArea: text("service_area"),
    verificationStatus: verificationStatusEnum("verification_status")
      .notNull()
      .default("UNVERIFIED"),
    visibility: profileVisibilityEnum("visibility").notNull().default("PRIVATE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("organization_profiles_org_unique").on(t.organizationId),
  ],
);

export type OrganizationProfile = typeof organizationProfiles.$inferSelect;
export type NewOrganizationProfile = typeof organizationProfiles.$inferInsert;
