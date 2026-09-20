import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { customers } from "@/db/schema";
import { getActiveMembership } from "@/lib/authz/membership";
import type { ActiveMembership } from "@/lib/authz/membership";
import { NotFoundError } from "@/lib/errors";

/**
 * Load a customer only if the actor has an active membership in its org.
 * Cross-tenant → NotFound (non-disclosure).
 */
export async function requireOrgCustomer(
  actorUserId: string,
  customerId: string,
): Promise<{
  customer: typeof customers.$inferSelect;
  membership: ActiveMembership;
}> {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  const customer = rows[0];
  if (!customer) {
    throw new NotFoundError("Customer not found.");
  }
  const membership = await getActiveMembership(
    actorUserId,
    customer.organizationId,
  );
  if (!membership) {
    throw new NotFoundError("Customer not found.");
  }
  return { customer, membership };
}
