import { and, eq, isNull } from "drizzle-orm";
import { getDatabase } from "@/db";
import { domainEventOutbox } from "@/db/schema";
import type { AutomationTriggerType } from "@/lib/automation/types";
import { isUniqueViolation } from "@/lib/db-errors";

type OutboxPayload = {
  conversationId?: string;
  customerId?: string;
  conversation?: Record<string, unknown>;
  customer?: Record<string, unknown>;
  message?: Record<string, unknown>;
};

/**
 * Enqueue a domain event for automation. Idempotent on (org, eventKey).
 * Call after domain mutation commits, or within the same transaction when
 * a tx client is provided via the database connection's transaction.
 */
export async function enqueueDomainEvent(input: {
  organizationId: string;
  triggerType: AutomationTriggerType;
  eventKey: string;
  payload: OutboxPayload;
  depth?: number;
}): Promise<{ id: string; duplicate: boolean }> {
  const db = getDatabase();
  try {
    const [row] = await db
      .insert(domainEventOutbox)
      .values({
        organizationId: input.organizationId,
        triggerType: input.triggerType,
        eventKey: input.eventKey,
        payload: input.payload as Record<string, unknown>,
        depth: input.depth ?? 0,
      })
      .returning();
    if (!row) throw new Error("Failed to enqueue domain event");
    return { id: row.id, duplicate: false };
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { id: "", duplicate: true };
    }
    throw e;
  }
}

/**
 * Process pending outbox rows for an organization (or all if unspecified).
 * Synchronous in-process dispatcher — failures leave processedAt null for retry.
 */
export async function processDomainEventOutbox(options?: {
  organizationId?: string;
  limit?: number;
}): Promise<number> {
  const db = getDatabase();
  const limit = options?.limit ?? 20;

  const pending = await db
    .select()
    .from(domainEventOutbox)
    .where(
      options?.organizationId
        ? and(
            isNull(domainEventOutbox.processedAt),
            eq(domainEventOutbox.organizationId, options.organizationId),
          )
        : isNull(domainEventOutbox.processedAt),
    )
    .orderBy(domainEventOutbox.createdAt)
    .limit(limit);

  const { emitAutomationEvent } = await import("@/lib/automation/engine");
  let processed = 0;

  for (const row of pending) {
    try {
      const payload = row.payload as OutboxPayload;
      await emitAutomationEvent({
        organizationId: row.organizationId,
        triggerType: row.triggerType as AutomationTriggerType,
        eventKey: row.eventKey,
        context: {
          conversationId: payload.conversationId,
          customerId: payload.customerId,
          conversation: payload.conversation as never,
          customer: payload.customer as never,
          message: payload.message as never,
          depth: row.depth,
        },
      });
      await db
        .update(domainEventOutbox)
        .set({ processedAt: new Date() })
        .where(
          and(
            eq(domainEventOutbox.id, row.id),
            isNull(domainEventOutbox.processedAt),
          ),
        );
      processed += 1;
    } catch {
      // Leave unprocessed for retry; do not mark success
    }
  }
  return processed;
}

/**
 * Enqueue + immediately attempt process (reliable sync path for request lifecycle).
 */
export async function dispatchDomainEventReliable(input: {
  organizationId: string;
  triggerType: AutomationTriggerType;
  eventKey: string;
  payload: OutboxPayload;
  depth?: number;
}): Promise<void> {
  const { duplicate } = await enqueueDomainEvent(input);
  if (duplicate) {
    // Still try process in case previous attempt failed mid-way
  }
  await processDomainEventOutbox({
    organizationId: input.organizationId,
    limit: 50,
  });
}
