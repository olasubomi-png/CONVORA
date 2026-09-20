import { jsonb, pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("audit_events_organization_id_idx").on(t.organizationId),
  index("audit_events_actor_user_id_idx").on(t.actorUserId),
  index("audit_events_event_type_idx").on(t.eventType),
  index("audit_events_created_at_idx").on(t.createdAt),
]);

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
export const AUDIT_EVENT_TYPES = ["USER_REGISTERED","USER_LOGIN","USER_LOGOUT","ORGANIZATION_CREATED","MEMBER_INVITED","MEMBER_ROLE_CHANGED","MEMBER_SUSPENDED","MEMBER_REMOVED"] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];
