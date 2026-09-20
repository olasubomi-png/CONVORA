import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { customers } from "@/db/schema";
import { requireOrgCustomer } from "@/lib/customers/access";
import { recordAuditEvent } from "@/lib/audit";
import { ConflictError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db-errors";

export type UpdateCustomerInput = {
  displayName?: string;
  email?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  location?: string | null;
  internalSummary?: string | null;
};

function emptyToNull(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return v.trim();
}

export async function updateCustomer(
  actorUserId: string,
  customerId: string,
  input: UpdateCustomerInput,
) {
  const { customer, membership } = await requireOrgCustomer(
    actorUserId,
    customerId,
  );

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.displayName !== undefined) {
    patch.displayName = input.displayName.trim();
  }
  if (input.email !== undefined) {
    const e = emptyToNull(input.email);
    patch.email = typeof e === "string" ? e.toLowerCase() : e;
  }
  if (input.phone !== undefined) patch.phone = emptyToNull(input.phone);
  if (input.avatarUrl !== undefined) {
    patch.avatarUrl = emptyToNull(input.avatarUrl);
  }
  if (input.companyName !== undefined) {
    patch.companyName = emptyToNull(input.companyName);
  }
  if (input.jobTitle !== undefined) {
    patch.jobTitle = emptyToNull(input.jobTitle);
  }
  if (input.location !== undefined) {
    patch.location = emptyToNull(input.location);
  }
  if (input.internalSummary !== undefined) {
    patch.internalSummary = emptyToNull(input.internalSummary);
  }

  const db = getDatabase();
  try {
    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(customers)
        .set(patch)
        .where(eq(customers.id, customerId))
        .returning();
      if (!updated) throw new Error("Failed to update customer");

      await recordAuditEvent(
        {
          eventType: "CUSTOMER_UPDATED",
          actorUserId,
          organizationId: customer.organizationId,
          payload: {
            customerId,
            fields: Object.keys(input),
            actorMembershipId: membership.id,
          },
        },
        tx,
      );

      return updated;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        "A customer with this email already exists in the organization.",
      );
    }
    throw error;
  }
}
