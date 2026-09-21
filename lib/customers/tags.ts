import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { conversationTags, customerTagLinks } from "@/db/schema";
import { requireOrgCustomer } from "@/lib/customers/access";
import { recordAuditEvent } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db-errors";

export async function addCustomerTag(
  actorUserId: string,
  customerId: string,
  tagId: string,
) {
  const { customer } = await requireOrgCustomer(actorUserId, customerId);
  const db = getDatabase();

  const tagRows = await db
    .select()
    .from(conversationTags)
    .where(eq(conversationTags.id, tagId))
    .limit(1);
  const tag = tagRows[0];
  if (!tag || tag.organizationId !== customer.organizationId) {
    throw new NotFoundError("Tag not found.");
  }

  let linked = true;
  try {
    await db.transaction(async (tx) => {
      await tx.insert(customerTagLinks).values({
        customerId,
        tagId,
        organizationId: customer.organizationId,
      });
      await recordAuditEvent(
        {
          eventType: "CUSTOMER_TAG_ADDED",
          actorUserId,
          organizationId: customer.organizationId,
          payload: { customerId, tagId },
        },
        tx,
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      linked = false;
    } else {
      throw error;
    }
  }

  if (linked) {
    await import("@/lib/automation/dispatch").then(({ dispatchAutomationEvent }) =>
      dispatchAutomationEvent({
        organizationId: customer.organizationId,
        triggerType: "customer.tag_added",
        eventKey: `customer:${customerId}:tag:${tagId}:added`,
        customerId,
      }),
    );
  }

  return tag;
}

export async function removeCustomerTag(
  actorUserId: string,
  customerId: string,
  tagId: string,
) {
  const { customer } = await requireOrgCustomer(actorUserId, customerId);
  const db = getDatabase();
  await db.transaction(async (tx) => {
    await tx
      .delete(customerTagLinks)
      .where(
        and(
          eq(customerTagLinks.customerId, customerId),
          eq(customerTagLinks.tagId, tagId),
        ),
      );
    await recordAuditEvent(
      {
        eventType: "CUSTOMER_TAG_REMOVED",
        actorUserId,
        organizationId: customer.organizationId,
        payload: { customerId, tagId },
      },
      tx,
    );
  });

  await import("@/lib/automation/dispatch").then(({ dispatchAutomationEvent }) =>
    dispatchAutomationEvent({
      organizationId: customer.organizationId,
      triggerType: "customer.tag_removed",
      eventKey: `customer:${customerId}:tag:${tagId}:removed`,
      customerId,
    }),
  );
}

export async function listCustomerTags(
  actorUserId: string,
  customerId: string,
) {
  await requireOrgCustomer(actorUserId, customerId);
  const db = getDatabase();
  return db
    .select({
      id: conversationTags.id,
      name: conversationTags.name,
      slug: conversationTags.slug,
    })
    .from(customerTagLinks)
    .innerJoin(
      conversationTags,
      eq(customerTagLinks.tagId, conversationTags.id),
    )
    .where(eq(customerTagLinks.customerId, customerId));
}
