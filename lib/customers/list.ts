import { and, desc, eq, or, sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import { customers } from "@/db/schema";
import { getActiveMembership } from "@/lib/authz/membership";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import {
  decodeTimeIdCursor,
  encodeTimeIdCursor,
} from "@/lib/conversations/cursors";

const PAGE_SIZE = 30;
const MAX_PAGE = 100;

export async function listCustomers(
  actorUserId: string,
  organizationId: string,
  options?: {
    q?: string;
    cursor?: string;
    limit?: number;
  },
) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }

  const limit = Math.min(Math.max(1, options?.limit ?? PAGE_SIZE), MAX_PAGE);
  const db = getDatabase();
  const conditions = [
    eq(customers.organizationId, organizationId),
    eq(customers.status, "ACTIVE"),
  ];

  if (options?.q?.trim()) {
    const qRaw = options.q.trim().slice(0, 100);
    const term = `%${qRaw.toLowerCase()}%`;
    conditions.push(
      or(
        sql`lower(${customers.displayName}) like ${term}`,
        sql`lower(coalesce(${customers.email}, '')) like ${term}`,
        sql`lower(coalesce(${customers.phone}, '')) like ${term}`,
        sql`lower(coalesce(${customers.companyName}, '')) like ${term}`,
      )!,
    );
  }

  if (options?.cursor) {
    const cursor = decodeTimeIdCursor(options.cursor);
    const anchor = await db
      .select({
        id: customers.id,
        organizationId: customers.organizationId,
      })
      .from(customers)
      .where(eq(customers.id, cursor.id))
      .limit(1);
    if (!anchor[0] || anchor[0].organizationId !== organizationId) {
      throw new ValidationError("Invalid pagination cursor.");
    }
    const tIso = cursor.createdAt.toISOString();
    conditions.push(
      sql`(
        ${customers.createdAt} < ${tIso}::timestamptz
        OR (
          ${customers.createdAt} = ${tIso}::timestamptz
          AND ${customers.id} < ${cursor.id}::uuid
        )
      )`,
    );
  }

  const rows = await db
    .select({
      id: customers.id,
      displayName: customers.displayName,
      email: customers.email,
      phone: customers.phone,
      companyName: customers.companyName,
      jobTitle: customers.jobTitle,
      location: customers.location,
      createdAt: customers.createdAt,
      updatedAt: customers.updatedAt,
    })
    .from(customers)
    .where(and(...conditions))
    .orderBy(desc(customers.createdAt), desc(customers.id))
    .limit(limit);

  return {
    customers: rows,
    nextCursor:
      rows.length === limit && rows[rows.length - 1]
        ? encodeTimeIdCursor(
            rows[rows.length - 1]!.createdAt,
            rows[rows.length - 1]!.id,
          )
        : null,
  };
}

export async function getCustomerDetail(
  actorUserId: string,
  customerId: string,
) {
  const { requireOrgCustomer } = await import("@/lib/customers/access");
  const { customer, membership } = await requireOrgCustomer(
    actorUserId,
    customerId,
  );
  return { customer, viewerMembershipId: membership.id };
}
