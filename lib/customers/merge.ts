import { eq, sql } from "drizzle-orm";
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
 * Merge source into canonical within the same organization.
 *
 * - Locks both rows with FOR UPDATE in deterministic ID order (deadlock-safe)
 * - Rejects MERGED sources/targets and cycles
 * - Reassigns conversations/notes; tags/attributes canonical-wins
 * - Soft-retires source with status=MERGED and mergedIntoCustomerId
 */
export async function mergeCustomers(
  actorUserId: string,
  canonicalCustomerId: string,
  sourceCustomerId: string,
) {
  if (canonicalCustomerId === sourceCustomerId) {
    throw new ValidationError("Cannot merge a customer into itself.");
  }

  const { customer: targetAuth, membership } = await requireOrgCustomer(
    actorUserId,
    canonicalCustomerId,
  );
  if (!isAdminRole(membership.role)) {
    throw new AuthorizationError(
      "Only admins or owners can merge customers.",
    );
  }

  // Pre-check source is same-org (also NotFound if cross-tenant)
  const { customer: sourceAuth } = await requireOrgCustomer(
    actorUserId,
    sourceCustomerId,
  );
  if (sourceAuth.organizationId !== targetAuth.organizationId) {
    throw new ConflictError("Customers must belong to the same organization.");
  }

  // Deterministic lock order by UUID string comparison
  const firstId =
    canonicalCustomerId < sourceCustomerId
      ? canonicalCustomerId
      : sourceCustomerId;
  const secondId =
    firstId === canonicalCustomerId ? sourceCustomerId : canonicalCustomerId;

  const db = getDatabase();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM customers WHERE id = ${firstId} FOR UPDATE`,
    );
    await tx.execute(
      sql`SELECT id FROM customers WHERE id = ${secondId} FOR UPDATE`,
    );

    const [targetRows, sourceRows] = await Promise.all([
      tx
        .select()
        .from(customers)
        .where(eq(customers.id, canonicalCustomerId))
        .limit(1),
      tx
        .select()
        .from(customers)
        .where(eq(customers.id, sourceCustomerId))
        .limit(1),
    ]);

    const target = targetRows[0];
    const source = sourceRows[0];
    if (!target || !source) {
      throw new ConflictError("Customer no longer available for merge.");
    }
    if (target.organizationId !== source.organizationId) {
      throw new ConflictError("Customers must belong to the same organization.");
    }
    if (target.status !== "ACTIVE") {
      throw new ConflictError("Canonical customer is not active.");
    }
    if (source.status !== "ACTIVE") {
      throw new ConflictError("Source customer has already been merged.");
    }
    if (source.mergedIntoCustomerId) {
      throw new ConflictError("Source customer has already been merged.");
    }
    // Prevent cycles: canonical must not already point at source
    if (target.mergedIntoCustomerId === sourceCustomerId) {
      throw new ConflictError("Invalid merge cycle.");
    }

    await tx
      .update(conversations)
      .set({ customerId: canonicalCustomerId, updatedAt: new Date() })
      .where(eq(conversations.customerId, sourceCustomerId));

    await tx
      .update(customerNotes)
      .set({ customerId: canonicalCustomerId })
      .where(eq(customerNotes.customerId, sourceCustomerId));

    const sourceTags = await tx
      .select()
      .from(customerTagLinks)
      .where(eq(customerTagLinks.customerId, sourceCustomerId));
    for (const link of sourceTags) {
      await tx
        .insert(customerTagLinks)
        .values({ customerId: canonicalCustomerId, tagId: link.tagId })
        .onConflictDoNothing();
    }
    await tx
      .delete(customerTagLinks)
      .where(eq(customerTagLinks.customerId, sourceCustomerId));

    // Attributes: canonical wins — source only fills gaps
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

    await tx
      .update(customers)
      .set({
        status: "MERGED",
        mergedIntoCustomerId: canonicalCustomerId,
        email: null,
        phone: null,
        displayName: source.displayName,
        internalSummary: `Merged into customer ${canonicalCustomerId}`,
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
