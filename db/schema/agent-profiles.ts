import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { memberships } from "./memberships";

export const verificationStatusEnum = pgEnum("verification_status", [
  "UNVERIFIED",
  "PENDING",
  "VERIFIED",
  "SUSPENDED",
]);

export const profileVisibilityEnum = pgEnum("profile_visibility", [
  "PUBLIC",
  "PRIVATE",
]);

/**
 * Public professional identity for a membership within an organization.
 * Bound to membership_id (not global user_id) so multi-org users can have
 * distinct profiles per organization.
 */
export const agentProfiles = pgTable(
  "agent_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    publicUsername: text("public_username").notNull(),
    displayName: text("display_name").notNull(),
    professionalTitle: text("professional_title"),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    location: text("location"),
    serviceArea: text("service_area"),
    yearsExperience: integer("years_experience"),
    verificationStatus: verificationStatusEnum("verification_status")
      .notNull()
      .default("UNVERIFIED"),
    visibility: profileVisibilityEnum("visibility").notNull().default("PRIVATE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agent_profiles_membership_unique").on(t.membershipId),
    uniqueIndex("agent_profiles_username_unique").on(t.publicUsername),
    index("agent_profiles_visibility_idx").on(t.visibility),
  ],
);

export type AgentProfile = typeof agentProfiles.$inferSelect;
export type NewAgentProfile = typeof agentProfiles.$inferInsert;
export type VerificationStatus = (typeof verificationStatusEnum.enumValues)[number];
export type ProfileVisibility = (typeof profileVisibilityEnum.enumValues)[number];
