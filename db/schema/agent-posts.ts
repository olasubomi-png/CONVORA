import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { agentProfiles } from "./agent-profiles";

export const agentPostTypeEnum = pgEnum("agent_post_type", [
  "TEXT",
  "IMAGE",
  "VIDEO",
  "DOCUMENT",
  "LINK",
]);

export const agentPostVisibilityEnum = pgEnum("agent_post_visibility", [
  "DRAFT",
  "PUBLIC",
  "ARCHIVED",
]);

/**
 * Professional activity on an agent profile — not a social network.
 * Media is stored as URL references only.
 */
export const agentPosts = pgTable(
  "agent_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentProfileId: uuid("agent_profile_id")
      .notNull()
      .references(() => agentProfiles.id, { onDelete: "cascade" }),
    type: agentPostTypeEnum("type").notNull().default("TEXT"),
    body: text("body").notNull(),
    mediaUrl: text("media_url"),
    visibility: agentPostVisibilityEnum("visibility").notNull().default("DRAFT"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    index("agent_posts_profile_id_idx").on(t.agentProfileId),
    index("agent_posts_visibility_idx").on(t.visibility),
  ],
);

export type AgentPost = typeof agentPosts.$inferSelect;
export type NewAgentPost = typeof agentPosts.$inferInsert;
export type AgentPostType = (typeof agentPostTypeEnum.enumValues)[number];
export type AgentPostVisibility = (typeof agentPostVisibilityEnum.enumValues)[number];
