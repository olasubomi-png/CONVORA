import { and, eq, gte, lt, type SQL } from "drizzle-orm";
import { conversations, messages } from "@/db/schema";
import type { AnalyticsFilters } from "@/lib/analytics/filters";

/**
 * Dimension filters only (no date). Used when joining messages to conversations
 * so message time-window is independent of conversation createdAt.
 */
export function conversationDimensionPredicates(
  f: AnalyticsFilters,
): SQL | undefined {
  const clauses: SQL[] = [
    eq(conversations.organizationId, f.organizationId),
  ];
  if (f.channel) clauses.push(eq(conversations.channel, f.channel));
  if (f.status) clauses.push(eq(conversations.status, f.status));
  if (f.priority) clauses.push(eq(conversations.priority, f.priority));
  if (f.agentMembershipId) {
    clauses.push(eq(conversations.assignedToMembershipId, f.agentMembershipId));
  }
  return and(...clauses);
}

/** Conversations created within the analytics window + dimensions. */
export function conversationWindowPredicates(f: AnalyticsFilters): SQL {
  return and(
    conversationDimensionPredicates(f),
    gte(conversations.createdAt, f.range.from),
    lt(conversations.createdAt, f.range.to),
  )!;
}

/**
 * Messages created within the analytics window on conversations matching dimensions.
 */
export function messageWindowPredicates(f: AnalyticsFilters): SQL {
  return and(
    conversationDimensionPredicates(f),
    gte(messages.createdAt, f.range.from),
    lt(messages.createdAt, f.range.to),
  )!;
}
