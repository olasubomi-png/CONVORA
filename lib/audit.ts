import { getDatabase, type Database } from "@/db";
import { auditEvents, type AuditEventType } from "@/db/schema";

/** Executor that can insert (root DB or transaction). */
export type AuditExecutor = Pick<Database, "insert">;

export async function recordAuditEvent(
  input: {
    eventType: AuditEventType;
    actorUserId?: string | null;
    organizationId?: string | null;
    payload?: Record<string, unknown>;
  },
  executor: AuditExecutor = getDatabase(),
): Promise<void> {
  await executor.insert(auditEvents).values({
    eventType: input.eventType,
    actorUserId: input.actorUserId ?? null,
    organizationId: input.organizationId ?? null,
    payload: input.payload ?? {},
  });
}
