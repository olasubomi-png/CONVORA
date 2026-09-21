import type { AutomationTriggerType } from "@/lib/automation/types";
import {
  enqueueDomainEvent,
  flushDomainEventOutbox,
  type OutboxPayload,
} from "@/lib/automation/outbox";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";

type Tx = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/**
 * Enqueue inside an open transaction (preferred for domain mutations).
 */
export async function enqueueAutomationEvent(
  input: {
    organizationId: string;
    triggerType: AutomationTriggerType;
    eventKey: string;
    payload: OutboxPayload;
    depth?: number;
  },
  tx: Tx,
): Promise<void> {
  await enqueueDomainEvent(input, tx);
}

/**
 * Process outbox after the caller transaction has committed.
 */
export async function flushAutomationEvents(
  organizationId: string,
): Promise<void> {
  await flushDomainEventOutbox(organizationId);
}
