import { getDatabase } from "@/db";
import { customers } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import { ConflictError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db-errors";
import {
  enqueueAutomationEvent,
  flushAutomationEvents,
} from "@/lib/automation/dispatch";
import { getActiveMembership } from "@/lib/authz/membership";
import { AuthorizationError } from "@/lib/errors";

export type CreateCustomerInput = {
  displayName: string;
  email?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  location?: string | null;
  internalSummary?: string | null;
  metadata?: Record<string, unknown>;
};

function emptyToNull(v: string | null | undefined): string | null {
  if (v === undefined || v === null || v === "") return null;
  return v.trim();
}

export async function createCustomer(
  organizationId: string,
  actorUserId: string,
  input: CreateCustomerInput,
) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }

  const db = getDatabase();
  try {
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(customers)
        .values({
          organizationId,
          displayName: input.displayName.trim(),
          email: emptyToNull(input.email)?.toLowerCase() ?? null,
          phone: emptyToNull(input.phone),
          avatarUrl: emptyToNull(input.avatarUrl),
          companyName: emptyToNull(input.companyName),
          jobTitle: emptyToNull(input.jobTitle),
          location: emptyToNull(input.location),
          internalSummary: emptyToNull(input.internalSummary),
          metadata: input.metadata ?? {},
        })
        .returning();
      if (!row) throw new Error("Failed to create customer");

      await recordAuditEvent(
        {
          eventType: "CUSTOMER_CREATED",
          actorUserId,
          organizationId,
          payload: { customerId: row.id },
        },
        tx,
      );

      await enqueueAutomationEvent(
        {
          organizationId,
          triggerType: "customer.created",
          eventKey: `customer:${row.id}:created`,
          payload: {
            customerId: row.id,
            customer: {
              displayName: row.displayName,
              email: row.email,
              phone: row.phone,
            },
          },
        },
        tx,
      );
      return row;
    });
    await flushAutomationEvents(organizationId);
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        "A customer with this email already exists in the organization.",
      );
    }
    throw error;
  }
}
