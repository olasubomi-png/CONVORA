import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  customers,
  conversations,
  customerNotes,
  customerTagLinks,
  customerAttributeValues,
} from "@/db/schema";
import { requireOrgCustomer } from "@/lib/customers/access";
import { recordAuditEvent } from "@/lib/audit";
import { isAdminRole } from "@/lib/authz/roles";
import {
  AuthorizationError,
  ValidationError,
  ConflictError,
} from "@/lib/errors";

/**
 * Merge source customer into canonical target within the same organization.
 * Reassigns conversations, notes, tags, attributes; does not delete history.
 * OWNER/ADMIN only.
 */
export async function mergeCustomers(
  actorUserId: string,
  canonicalCustomerId: string,
  sourceCustomerId: string,
) {
  if (canonicalCustomerId === sourceCustomerId) {
    throw new ValidationError("Cannot merge a customer into itself.");
  }

  const { customer: target, membership } = await requireOrgCustomer(
    actorUserId,
    canonicalCustomerId,
  );
  if (!isAdminRole(membership.role)) {
    throw new AuthorizationError(
      "Only admins or owners can merge customers.",
    );
  }

  const { customer: source } = await requireOrgCustomer(
    actorUserId,
    sourceCustomerId,
  );

  if (source.organizationId !== target.organizationId) {
    throw new ConflictError("Customers must belong to the same organization.");
  }

  const db = getDatabase();
  return db.transaction(async (tx) => {
    await tx
      .update(conversations)
      .set({ customerId: canonicalCustomerId, updatedAt: new Date() })
      .where(eq(conversations.customerId, sourceCustomerId));

    await tx
      .update(customerNotes)
      .set({ customerId: canonicalCustomerId })
      .where(eq(customerNotes.customerId, sourceCustomerId));

    // Move tags (ignore conflicts on already-present tags)
    const sourceTags = await tx
      .select()
      .from(customerTagLinks)
      .where(eq(customerTagLinks.customerId, sourceCustomerId));
    for (const link of sourceTags) {
      await tx
        .insert(customerTagLinks)
        .values({
          customerId: canonicalCustomerId,
          tagId: link.tagId,
        })
        .onConflictDoNothing();
    }
    await tx
      .delete(customerTagLinks)
      .where(eq(customerTagLinks.customerId, sourceCustomerId));

    // Attribute values: prefer canonical; drop source on conflict
    const sourceAttrs = await tx
      .select()
      .from(customerAttributeValues)
      .where(eq(customerAttributeValues.customerId, sourceCustomerId));
    for (const attr of sourceAttrs) {
      await tx
        .insert(customerAttributeValues)
        .values({
          customerId: canonicalCustomerId,
          definitionId: attr.definitionId,
          valueText: attr.valueText,
          valueNumber: attr.valueNumber,
          valueBoolean: attr.valueBoolean,
          valueDate: attr.valueDate,
        })
        .onConflictDoNothing();
    }
    await tx
      .delete(customerAttributeValues)
      .where(eq(customerAttributeValues.customerId, sourceCustomerId));

    // Soft-retire source: rename to avoid email unique conflict
    await tx
      .update(customers)
      .set({
        email: null,
        phone: null,
        displayName: `[Merged] ${source.displayName}`,
        internalSummary: `Merged into ${canonicalCustomerId}`,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, sourceCustomerId));

    await recordAuditEvent(
      {
        eventType: "CUSTOMER_MERGED",
        actorUserId,
        organizationId: target.organizationId,
        payload: {
          customerId: canonicalCustomerId,
          sourceCustomerId,
        },
      },
      tx,
    );

    return { canonicalCustomerId, sourceCustomerId };
  });
}
