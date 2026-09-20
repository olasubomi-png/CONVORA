import { getDatabase } from "@/db";
import {
  conversations,
  conversationParticipants,
  customers,
  type ConversationChannel,
  type ConversationPriority,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit";
import { NotFoundError, AuthorizationError } from "@/lib/errors";
import { getActiveMembership } from "@/lib/authz/membership";

export type CreateConversationInput = {
  customerId: string;
  subject?: string | null;
  channel?: ConversationChannel;
  priority?: ConversationPriority;
  initialMessage?: string | null;
};

export async function createConversation(
  actorUserId: string,
  organizationId: string,
  input: CreateConversationInput,
) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }

  const db = getDatabase();
  const customerRows = await db
    .select()
    .from(customers)
    .where(eq(customers.id, input.customerId))
    .limit(1);
  const customer = customerRows[0];
  if (!customer || customer.organizationId !== organizationId) {
    throw new NotFoundError("Customer not found.");
  }

  const result = await db.transaction(async (tx) => {
    const [conversation] = await tx
      .insert(conversations)
      .values({
        organizationId,
        customerId: customer.id,
        subject: input.subject?.trim() || null,
        channel: input.channel ?? "WEB",
        priority: input.priority ?? "NORMAL",
        status: "OPEN",
        assignedToMembershipId: membership.id,
        lastMessageAt: input.initialMessage ? new Date() : null,
      })
      .returning();
    if (!conversation) throw new Error("Failed to create conversation");

    await tx.insert(conversationParticipants).values([
      {
        conversationId: conversation.id,
        customerId: customer.id,
        role: "CUSTOMER",
      },
      {
        conversationId: conversation.id,
        membershipId: membership.id,
        role: "AGENT",
      },
    ]);

    if (input.initialMessage?.trim()) {
      const { messages } = await import("@/db/schema");
      await tx.insert(messages).values({
        conversationId: conversation.id,
        senderType: "MEMBERSHIP",
        senderMembershipId: membership.id,
        body: input.initialMessage.trim(),
        messageType: "TEXT",
      });
    }

    await recordAuditEvent(
      {
        eventType: "CONVERSATION_CREATED",
        actorUserId,
        organizationId,
        payload: {
          conversationId: conversation.id,
          channel: conversation.channel,
        },
      },
      tx,
    );

    return conversation;
  });

  void import("@/lib/automation/dispatch").then(({ dispatchAutomationEvent }) =>
    dispatchAutomationEvent({
      organizationId,
      triggerType: "conversation.created",
      eventKey: `conversation:${result.id}:created`,
      conversationId: result.id,
      customerId: result.customerId,
      conversation: {
        status: result.status,
        priority: result.priority,
        channel: result.channel,
        assignedToMembershipId: result.assignedToMembershipId,
      },
    }),
  );

  return result;
}
