import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { memberships } from "./memberships";
import { conversations } from "./conversations";

export const agentPresenceStatusEnum = pgEnum("agent_presence_status", [
  "ONLINE",
  "AWAY",
  "OFFLINE",
]);

export const teamMemberRoleEnum = pgEnum("team_member_role", [
  "MEMBER",
  "LEAD",
]);

/** Organization-scoped agent presence (membership-bound). */
export const agentPresence = pgTable(
  "agent_presence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    status: agentPresenceStatusEnum("status").notNull().default("OFFLINE"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("agent_presence_membership_unique").on(t.membershipId),
    index("agent_presence_organization_id_idx").on(t.organizationId),
    foreignKey({
      columns: [t.organizationId, t.membershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
      name: "agent_presence_membership_org_fk",
    }).onDelete("cascade"),
  ],
);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("teams_org_name_unique").on(t.organizationId, t.name),
    index("teams_organization_id_idx").on(t.organizationId),
    uniqueIndex("teams_org_id_unique").on(t.organizationId, t.id),
  ],
);

export const teamMemberships = pgTable(
  "team_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    teamId: uuid("team_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    role: teamMemberRoleEnum("role").notNull().default("MEMBER"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("team_memberships_team_member_unique").on(
      t.teamId,
      t.membershipId,
    ),
    index("team_memberships_organization_id_idx").on(t.organizationId),
    index("team_memberships_membership_id_idx").on(t.membershipId),
    foreignKey({
      columns: [t.organizationId, t.teamId],
      foreignColumns: [teams.organizationId, teams.id],
      name: "team_memberships_team_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.organizationId, t.membershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
      name: "team_memberships_membership_org_fk",
    }).onDelete("cascade"),
  ],
);

export const conversationWatchers = pgTable(
  "conversation_watchers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("conversation_watchers_unique").on(
      t.conversationId,
      t.membershipId,
    ),
    index("conversation_watchers_organization_id_idx").on(t.organizationId),
    foreignKey({
      columns: [t.organizationId, t.conversationId],
      foreignColumns: [conversations.organizationId, conversations.id],
      name: "conversation_watchers_conversation_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.organizationId, t.membershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
      name: "conversation_watchers_membership_org_fk",
    }).onDelete("cascade"),
  ],
);

/**
 * Append-only assignment history (separate from active assignment rows).
 */
export const conversationAssignmentHistory = pgTable(
  "conversation_assignment_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    actorMembershipId: uuid("actor_membership_id"),
    previousMembershipId: uuid("previous_membership_id"),
    newMembershipId: uuid("new_membership_id"),
    action: text("action").notNull(), // ASSIGN | REASSIGN | UNASSIGN
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("conversation_assignment_history_conversation_id_idx").on(
      t.conversationId,
    ),
    index("conversation_assignment_history_organization_id_idx").on(
      t.organizationId,
    ),
  ],
);

export type AgentPresence = typeof agentPresence.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type TeamMembership = typeof teamMemberships.$inferSelect;
export type ConversationWatcher = typeof conversationWatchers.$inferSelect;
