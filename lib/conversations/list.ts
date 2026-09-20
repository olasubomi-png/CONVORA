import { and, desc, eq, lt, sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  conversations,
  customers,
  conversationReadState,
} from "@/db/schema";
import { getActiveMembership } from "@/lib/authz/membership";
import { AuthorizationError } from "@/lib/errors";
import type { ConversationStatus } from "@/db/schema";

const PAGE_SIZE = 30;

export async function listOrganizationConversations(
  actorUserId: string,
  organizationId: string,
  options?: {
    status?: ConversationStatus;
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

  const limit = Math.min(options?.limit ?? PAGE_SIZE, 100);
  const db = getDatabase();

  const conditions = [eq(conversations.organizationId, organizationId)];
  if (options?.status) {
    conditions.push(eq(conversations.status, options.status));
  }

  if (options?.cursor) {
    const anchor = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, options.cursor))
      .limit(1);
    if (anchor[0] && anchor[0].organizationId === organizationId) {
      conditions.push(
        lt(
          conversations.lastMessageAt,
          anchor[0].lastMessageAt ?? anchor[0].createdAt,
        ),
      );
    }
  }

  const rows = await db
    .select({
      id: conversations.id,
      status: conversations.status,
      priority: conversations.priority,
      channel: conversations.channel,
      subject: conversations.subject,
      lastMessageAt: conversations.lastMessageAt,
      assignedToMembershipId: conversations.assignedToMembershipId,
      createdAt: conversations.createdAt,
      customerId: customers.id,
      customerDisplayName: customers.displayName,
      lastReadAt: conversationReadState.lastReadAt,
    })
    .from(conversations)
    .innerJoin(customers, eq(conversations.customerId, customers.id))
    .leftJoin(
      conversationReadState,
      and(
        eq(conversationReadState.conversationId, conversations.id),
        eq(conversationReadState.membershipId, membership.id),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`))
    .limit(limit);

  return {
    conversations: rows.map((r) => ({
      id: r.id,
      status: r.status,
      priority: r.priority,
      channel: r.channel,
      subject: r.subject,
      lastMessageAt: r.lastMessageAt,
      assignedToMembershipId: r.assignedToMembershipId,
      createdAt: r.createdAt,
      customer: {
        id: r.customerId,
        displayName: r.customerDisplayName,
      },
      unread:
        r.lastMessageAt != null &&
        (r.lastReadAt == null || r.lastReadAt < r.lastMessageAt),
    })),
    nextCursor: rows.length === limit ? rows[rows.length - 1]?.id ?? null : null,
  };
}

export async function getConversationDetail(
  actorUserId: string,
  conversationId: string,
) {
  const { requireOrgConversation } = await import(
    "@/lib/conversations/access"
  );
  const { conversation, membership } = await requireOrgConversation(
    actorUserId,
    conversationId,
  );

  const db = getDatabase();
  const customerRows = await db
    .select()
    .from(customers)
    .where(eq(customers.id, conversation.customerId))
    .limit(1);

  return {
    conversation,
    customer: customerRows[0] ?? null,
    viewerMembershipId: membership.id,
  };
}
