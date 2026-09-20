import { asc, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { customerNotes } from "@/db/schema";
import { requireOrgCustomer } from "@/lib/customers/access";
import { recordAuditEvent } from "@/lib/audit";
import { ValidationError } from "@/lib/errors";

export async function addCustomerNote(
  actorUserId: string,
  customerId: string,
  body: string,
) {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 10000) {
    throw new ValidationError("Note body must be 1–10000 characters.");
  }

  const { customer, membership } = await requireOrgCustomer(
    actorUserId,
    customerId,
  );

  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [note] = await tx
      .insert(customerNotes)
      .values({
        customerId,
        authorMembershipId: membership.id,
        body: trimmed,
      })
      .returning();
    if (!note) throw new Error("Failed to create note");

    await recordAuditEvent(
      {
        eventType: "CUSTOMER_NOTE_ADDED",
        actorUserId,
        organizationId: customer.organizationId,
        payload: { customerId, noteId: note.id },
      },
      tx,
    );

    return note;
  });
}

export async function listCustomerNotes(
  actorUserId: string,
  customerId: string,
) {
  await requireOrgCustomer(actorUserId, customerId);
  const db = getDatabase();
  return db
    .select()
    .from(customerNotes)
    .where(eq(customerNotes.customerId, customerId))
    .orderBy(asc(customerNotes.createdAt))
    .limit(100);
}
