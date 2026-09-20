import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getDatabase } from "@/db";
import { messages, customers, customerNotes } from "@/db/schema";
import { requireOrgConversation } from "@/lib/conversations/access";
import { requireOrgCustomer } from "@/lib/customers/access";
import { wrapUntrustedContent } from "@/lib/ai/prompts";

const MAX_MESSAGES = 40;

export async function loadConversationAiContext(
  actorUserId: string,
  conversationId: string,
) {
  const { conversation, membership } = await requireOrgConversation(
    actorUserId,
    conversationId,
  );

  const db = getDatabase();
  const messageRows = await db
    .select({
      id: messages.id,
      senderType: messages.senderType,
      body: messages.body,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.deletedAt),
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(MAX_MESSAGES);

  const chronological = messageRows.reverse();

  const [customer] = await db
    .select({
      id: customers.id,
      displayName: customers.displayName,
      email: customers.email,
      companyName: customers.companyName,
    })
    .from(customers)
    .where(eq(customers.id, conversation.customerId))
    .limit(1);

  const transcript = chronological
    .map(
      (m) =>
        `[${m.senderType}] ${m.createdAt.toISOString()}: ${m.body.slice(0, 2000)}`,
    )
    .join("\n");

  return {
    conversation,
    membership,
    customer: customer ?? null,
    transcript: wrapUntrustedContent("TRANSCRIPT", transcript),
    messageCount: chronological.length,
  };
}

export async function loadCustomerAiContext(
  actorUserId: string,
  customerId: string,
) {
  const { customer, membership } = await requireOrgCustomer(
    actorUserId,
    customerId,
  );

  const db = getDatabase();
  const notes = await db
    .select({ body: customerNotes.body, createdAt: customerNotes.createdAt })
    .from(customerNotes)
    .where(eq(customerNotes.customerId, customerId))
    .orderBy(asc(customerNotes.createdAt))
    .limit(20);

  const profile = [
    `Name: ${customer.displayName}`,
    customer.email ? `Email: ${customer.email}` : null,
    customer.phone ? `Phone: ${customer.phone}` : null,
    customer.companyName ? `Company: ${customer.companyName}` : null,
    customer.jobTitle ? `Job: ${customer.jobTitle}` : null,
    customer.location ? `Location: ${customer.location}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const notesText = notes
    .map((n) => `- ${n.createdAt.toISOString()}: ${n.body.slice(0, 500)}`)
    .join("\n");

  return {
    customer,
    membership,
    profileBlock: wrapUntrustedContent("CUSTOMER_PROFILE", profile),
    notesBlock: wrapUntrustedContent("INTERNAL_NOTES", notesText || "None"),
  };
}
