import {
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { agentPosts } from "./agent-posts";
import { users } from "./users";

export const agentPostLikes = pgTable(
  "agent_post_likes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => agentPosts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("agent_post_likes_post_user_unique").on(t.postId, t.userId),
    index("agent_post_likes_post_id_idx").on(t.postId),
  ],
);

export const agentPostComments = pgTable(
  "agent_post_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => agentPosts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("agent_post_comments_post_id_idx").on(t.postId),
    index("agent_post_comments_user_id_idx").on(t.userId),
  ],
);

export type AgentPostLike = typeof agentPostLikes.$inferSelect;
export type AgentPostComment = typeof agentPostComments.$inferSelect;
