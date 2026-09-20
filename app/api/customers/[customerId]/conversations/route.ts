import { requireAuthenticatedUser } from "@/lib/authz/context";
import { requireOrgCustomer } from "@/lib/customers/access";
import { getDatabase } from "@/db";
import { conversations } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ customerId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { customerId } = await params;
    await requireOrgCustomer(auth.user.id, customerId);
    const db = getDatabase();
    const rows = await db
      .select({
        id: conversations.id,
        status: conversations.status,
        priority: conversations.priority,
        subject: conversations.subject,
        lastMessageAt: conversations.lastMessageAt,
        assignedToMembershipId: conversations.assignedToMembershipId,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(eq(conversations.customerId, customerId))
      .orderBy(desc(conversations.createdAt))
      .limit(50);
    return jsonOk({ conversations: rows });
  } catch (error) {
    return jsonError(error);
  }
}
