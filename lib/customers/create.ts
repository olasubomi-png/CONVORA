import { getDatabase } from "@/db";
import { customers } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";

export type CreateCustomerInput = {
  displayName: string;
  email?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export async function createCustomer(
  organizationId: string,
  actorUserId: string,
  input: CreateCustomerInput,
) {
  const db = getDatabase();
  const [row] = await db
    .insert(customers)
    .values({
      organizationId,
      displayName: input.displayName.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      avatarUrl: input.avatarUrl || null,
      metadata: input.metadata ?? {},
    })
    .returning();
  if (!row) throw new Error("Failed to create customer");

  await recordAuditEvent({
    eventType: "CUSTOMER_CREATED",
    actorUserId,
    organizationId,
    payload: { customerId: row.id },
  });

  return row;
}
