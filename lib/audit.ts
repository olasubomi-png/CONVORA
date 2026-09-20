import { getDatabase } from "@/db";
import { auditEvents, type AuditEventType } from "@/db/schema";

export async function recordAuditEvent(input: {
  eventType: AuditEventType; actorUserId?: string | null; organizationId?: string | null; payload?: Record<string, unknown>;
}): Promise<void> {
  const db = getDatabase();
  await db.insert(auditEvents).values({
    eventType: input.eventType,
    actorUserId: input.actorUserId ?? null,
    organizationId: input.organizationId ?? null,
    payload: input.payload ?? {},
  });
}
