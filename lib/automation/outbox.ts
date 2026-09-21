import { eq, sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { getDatabase } from "@/db";
import * as schema from "@/db/schema";
import { domainEventOutbox } from "@/db/schema";
import type { AutomationTriggerType } from "@/lib/automation/types";
import { isUniqueViolation } from "@/lib/db-errors";

type Tx = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export type OutboxPayload = {
  conversationId?: string;
  customerId?: string;
  conversation?: {
    status?: string;
    priority?: string;
    channel?: string;
    assignedToMembershipId?: string | null;
    previousStatus?: string;
    previousPriority?: string;
  };
  customer?: {
    displayName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  message?: {
    direction?: string;
    body?: string;
  };
};

const MAX_ATTEMPTS = 5;

function executor(tx?: Tx) {
  return tx ?? getDatabase();
}

export async function enqueueDomainEvent(
  input: {
    organizationId: string;
    triggerType: AutomationTriggerType;
    eventKey: string;
    payload: OutboxPayload;
    depth?: number;
  },
  tx?: Tx,
): Promise<{ id: string; duplicate: boolean }> {
  const db = executor(tx);
  try {
    const [row] = await db
      .insert(domainEventOutbox)
      .values({
        organizationId: input.organizationId,
        triggerType: input.triggerType,
        eventKey: input.eventKey,
        payload: input.payload,
        depth: input.depth ?? 0,
        status: "PENDING",
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
 * Claim PENDING rows with FOR UPDATE SKIP LOCKED via raw SQL, then process.
 */
export async function processDomainEventOutbox(options?: {
  organizationId?: string;
  limit?: number;
}): Promise<number> {
  const db = getDatabase();
  const limit = options?.limit ?? 20;

  const claimedIds = await db.transaction(async (tx) => {
    const orgClause = options?.organizationId
      ? sql`AND organization_id = ${options.organizationId}::uuid`
      : sql``;
    const result = await tx.execute(sql`
      UPDATE domain_event_outbox
      SET status = 'PROCESSING',
          attempt_count = attempt_count + 1
      WHERE id IN (
        SELECT id FROM domain_event_outbox
        WHERE status = 'PENDING'
          AND attempt_count < ${MAX_ATTEMPTS}
          ${orgClause}
        ORDER BY created_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `);
    const raw = result as unknown;
    if (raw && typeof raw === "object" && "rows" in raw) {
      const rows = (raw as { rows: Record<string, unknown>[] }).rows;
      return rows.map((r) => String(r.id));
    }
    if (Array.isArray(raw)) {
      return (raw as Record<string, unknown>[]).map((r) => String(r.id));
    }
    return [] as string[];
  });

  if (!claimedIds.length) return 0;

  const { emitAutomationEvent } = await import("@/lib/automation/engine");
  let processed = 0;

  for (const id of claimedIds) {
    const [row] = await db
      .select()
      .from(domainEventOutbox)
      .where(eq(domainEventOutbox.id, id))
      .limit(1);
    if (!row) continue;

    try {
      const payload = row.payload as OutboxPayload;
      await emitAutomationEvent({
        organizationId: row.organizationId,
        triggerType: row.triggerType as AutomationTriggerType,
        eventKey: row.eventKey,
        context: {
          conversationId: payload.conversationId,
          customerId: payload.customerId,
          conversation: payload.conversation,
          customer: payload.customer,
          message: payload.message,
          depth: row.depth,
        },
      });
      await db
        .update(domainEventOutbox)
        .set({
          status: "PROCESSED",
          processedAt: new Date(),
          lastError: null,
        })
        .where(eq(domainEventOutbox.id, id));
      processed += 1;
    } catch (error) {
      const reason =
        error instanceof Error ? error.message.slice(0, 300) : "failed";
      const failPermanent = row.attemptCount >= MAX_ATTEMPTS;
      await db
        .update(domainEventOutbox)
        .set({
          status: failPermanent ? "FAILED" : "PENDING",
          lastError: reason,
        })
        .where(eq(domainEventOutbox.id, id));
    }
  }
  return processed;
}

export async function flushDomainEventOutbox(
  organizationId: string,
): Promise<void> {
  await processDomainEventOutbox({ organizationId, limit: 50 });
}
