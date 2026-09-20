import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { memberships } from "./memberships";
import { conversations } from "./conversations";
import { customers } from "./customers";

export const aiGenerationTypeEnum = pgEnum("ai_generation_type", [
  "CONVERSATION_SUMMARY",
  "CUSTOMER_SUMMARY",
  "SUGGESTED_REPLY",
  "INTENT_CLASSIFICATION",
  "SENTIMENT_ANALYSIS",
  "PRIORITY_SIGNAL",
  "FACT_EXTRACTION",
  "INTERNAL_NOTE_SUGGESTION",
]);

export const aiGenerationStatusEnum = pgEnum("ai_generation_status", [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
]);

export const aiSuggestionStatusEnum = pgEnum("ai_suggestion_status", [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "DISMISSED",
]);

/**
 * One row per AI generation request. Does not store full prompts/responses
 * by default — only safe metadata and structured outputs when useful.
 */
export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorMembershipId: uuid("actor_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    generationType: aiGenerationTypeEnum("generation_type").notNull(),
    status: aiGenerationStatusEnum("status").notNull().default("PENDING"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    latencyMs: integer("latency_ms"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    /** Structured, non-sensitive result payload (validated). */
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("ai_generations_organization_id_idx").on(t.organizationId),
    index("ai_generations_conversation_id_idx").on(t.conversationId),
    index("ai_generations_customer_id_idx").on(t.customerId),
    index("ai_generations_type_idx").on(t.generationType),
    index("ai_generations_created_at_idx").on(t.createdAt),
  ],
);

/**
 * Agent-facing suggestions that may be accepted/rejected.
 * Never written as customer-facing messages automatically.
 */
export const aiSuggestions = pgTable(
  "ai_suggestions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    generationId: uuid("generation_id")
      .notNull()
      .references(() => aiGenerations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "cascade",
    }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "cascade",
    }),
    suggestionType: aiGenerationTypeEnum("suggestion_type").notNull(),
    status: aiSuggestionStatusEnum("status").notNull().default("PENDING"),
    /** Draft text or structured content for the agent to review. */
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByMembershipId: uuid("resolved_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
  },
  (t) => [
    index("ai_suggestions_organization_id_idx").on(t.organizationId),
    index("ai_suggestions_conversation_id_idx").on(t.conversationId),
    index("ai_suggestions_status_idx").on(t.status),
  ],
);

export type AiGeneration = typeof aiGenerations.$inferSelect;
export type AiSuggestion = typeof aiSuggestions.$inferSelect;
export type AiGenerationType = (typeof aiGenerationTypeEnum.enumValues)[number];
export type AiGenerationStatus =
  (typeof aiGenerationStatusEnum.enumValues)[number];
export type AiSuggestionStatus =
  (typeof aiSuggestionStatusEnum.enumValues)[number];
