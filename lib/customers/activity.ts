import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import { auditEvents } from "@/db/schema";
import { requireOrgCustomer } from "@/lib/customers/access";
import {
  decodeTimeIdCursor,
  encodeTimeIdCursor,
} from "@/lib/conversations/cursors";

const CUSTOMER_EVENTS = [
  "CUSTOMER_CREATED",
  "CUSTOMER_UPDATED",
  "CUSTOMER_NOTE_ADDED",
  "CUSTOMER_TAG_ADDED",
  "CUSTOMER_TAG_REMOVED",
  "CUSTOMER_ATTRIBUTES_UPDATED",
  "CUSTOMER_MERGED",
  "CONVERSATION_CREATED",
  "CONVERSATION_STATUS_CHANGED",
  "CONVERSATION_ASSIGNED",
  "CONVERSATION_UNASSIGNED",
] as const;

/**
 * Timeline from audit events: filter event types in SQL before LIMIT.
 * Ordering: createdAt DESC, id DESC.
 */
export async function listCustomerActivity(
  actorUserId: string,
  customerId: string,
  options?: { cursor?: string; limit?: number },
) {
  const { customer } = await requireOrgCustomer(actorUserId, customerId);
  const limit = Math.min(Math.max(1, options?.limit ?? 30), 100);
  const db = getDatabase();

  const conditions = [
    eq(auditEvents.organizationId, customer.organizationId),
    inArray(auditEvents.eventType, [...CUSTOMER_EVENTS]),
    sql`${auditEvents.payload}->>'customerId' = ${customerId}`,
  ];

  if (options?.cursor) {
    const cursor = decodeTimeIdCursor(options.cursor);
    const tIso = cursor.createdAt.toISOString();
    conditions.push(
      sql`(
        ${auditEvents.createdAt} < ${tIso}::timestamptz
        OR (
          ${auditEvents.createdAt} = ${tIso}::timestamptz
          AND ${auditEvents.id} < ${cursor.id}::uuid
        )
      )`,
    );
  }

  const rows = await db
    .select({
      id: auditEvents.id,
      eventType: auditEvents.eventType,
      createdAt: auditEvents.createdAt,
      payload: auditEvents.payload,
    })
    .from(auditEvents)
    .where(and(...conditions))
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(limit);

  return {
    events: rows.map((r) => ({
      id: r.id,
      type: r.eventType,
      createdAt: r.createdAt,
      meta: {
        conversationId:
          typeof r.payload?.conversationId === "string"
            ? r.payload.conversationId
            : undefined,
        noteId:
          typeof r.payload?.noteId === "string" ? r.payload.noteId : undefined,
        tagId:
          typeof r.payload?.tagId === "string" ? r.payload.tagId : undefined,
        fields: Array.isArray(r.payload?.fields) ? r.payload.fields : undefined,
        sourceCustomerId:
          typeof r.payload?.sourceCustomerId === "string"
            ? r.payload.sourceCustomerId
            : undefined,
      },
    })),
    nextCursor:
      rows.length === limit && rows[rows.length - 1]
        ? encodeTimeIdCursor(
            rows[rows.length - 1]!.createdAt,
            rows[rows.length - 1]!.id,
          )
        : null,
  };
}
