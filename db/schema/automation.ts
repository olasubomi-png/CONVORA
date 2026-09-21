import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { memberships } from "./memberships";

export const automationTriggerTypeEnum = pgEnum("automation_trigger_type", [
  "conversation.created",
  "conversation.message_received",
  "conversation.message_sent",
  "conversation.assigned",
  "conversation.unassigned",
  "conversation.status_changed",
  "conversation.priority_changed",
  "customer.created",
  "customer.updated",
  "customer.tag_added",
  "customer.tag_removed",
]);

export const automationExecutionStatusEnum = pgEnum(
  "automation_execution_status",
  ["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "SKIPPED"],
);

export const automationRules = pgTable(
  "automation_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(true),
    triggerType: automationTriggerTypeEnum("trigger_type").notNull(),
    /** Lower runs first. */
    priority: integer("priority").notNull().default(100),
    createdByMembershipId: uuid("created_by_membership_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("automation_rules_organization_id_idx").on(t.organizationId),
    index("automation_rules_org_trigger_idx").on(
      t.organizationId,
      t.triggerType,
      t.enabled,
    ),
    uniqueIndex("automation_rules_org_id_unique").on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.createdByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
      name: "automation_rules_creator_fk",
    }).onDelete("set null"),
  ],
);

/**
 * Structured conditions stored as JSON array on the rule for simplicity
 * while remaining typed at the application layer.
 * Separate table would be equivalent; JSON keeps Phase 10 focused.
 */
export const automationRuleDefinitions = pgTable(
  "automation_rule_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    ruleId: uuid("rule_id").notNull(),
    conditions: jsonb("conditions").notNull().$type<unknown[]>().default([]),
    actions: jsonb("actions").notNull().$type<unknown[]>().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("automation_rule_definitions_rule_unique").on(t.ruleId),
    foreignKey({
      columns: [t.organizationId, t.ruleId],
      foreignColumns: [automationRules.organizationId, automationRules.id],
      name: "automation_rule_definitions_rule_fk",
    }).onDelete("cascade"),
  ],
);

export const automationExecutions = pgTable(
  "automation_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    ruleId: uuid("rule_id").notNull(),
    triggerType: text("trigger_type").notNull(),
    /** Deterministic: org + rule + eventKey */
    idempotencyKey: text("idempotency_key").notNull(),
    status: automationExecutionStatusEnum("status").notNull().default("PENDING"),
    depth: integer("depth").notNull().default(0),
    eventPayload: jsonb("event_payload").$type<Record<string, unknown>>(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    failureReason: text("failure_reason"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("automation_executions_idempotency_unique").on(
      t.idempotencyKey,
    ),
    index("automation_executions_organization_id_idx").on(t.organizationId),
    index("automation_executions_rule_id_idx").on(t.ruleId),
    foreignKey({
      columns: [t.organizationId, t.ruleId],
      foreignColumns: [automationRules.organizationId, automationRules.id],
      name: "automation_executions_rule_fk",
    }).onDelete("cascade"),
  ],
);

export type AutomationRule = typeof automationRules.$inferSelect;
export type AutomationExecution = typeof automationExecutions.$inferSelect;

export const domainEventOutboxStatusEnum = pgEnum(
  "domain_event_outbox_status",
  ["PENDING", "PROCESSING", "PROCESSED", "FAILED"],
);

/** Durable domain event outbox for reliable automation dispatch. */
export const domainEventOutbox = pgTable(
  "domain_event_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    triggerType: text("trigger_type").notNull(),
    eventKey: text("event_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    depth: integer("depth").notNull().default(0),
    status: domainEventOutboxStatusEnum("status").notNull().default("PENDING"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("domain_event_outbox_event_key_unique").on(
      t.organizationId,
      t.eventKey,
    ),
    index("domain_event_outbox_status_idx").on(t.status, t.createdAt),
  ],
);
