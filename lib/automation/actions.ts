import { and, eq, isNull, sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  conversations,
  conversationAssignments,
  conversationAssignmentHistory,
  conversationNotes,
  conversationTags,
  conversationTagLinks,
  customerTagLinks,
  memberships,
} from "@/db/schema";
import type { AutomationAction, AutomationContext } from "@/lib/automation/types";
import { ValidationError, NotFoundError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db-errors";

/**
 * Execute one safe internal action with tenant checks.
 * Does not send external customer messages.
 */
export async function executeAction(
  action: AutomationAction,
  ctx: AutomationContext,
): Promise<{ type: string; ok: boolean; detail?: string }> {
  const db = getDatabase();

  switch (action.type) {
    case "set_conversation_status": {
      if (!ctx.conversationId) {
        return { type: action.type, ok: false, detail: "no_conversation" };
      }
      const [updated] = await db
        .update(conversations)
        .set({ status: action.status, updatedAt: new Date() })
        .where(
          and(
            eq(conversations.id, ctx.conversationId),
            eq(conversations.organizationId, ctx.organizationId),
          ),
        )
        .returning();
      if (!updated) throw new NotFoundError("Conversation not found.");
      return { type: action.type, ok: true };
    }

    case "set_priority": {
      if (!ctx.conversationId) {
        return { type: action.type, ok: false, detail: "no_conversation" };
      }
      const [updated] = await db
        .update(conversations)
        .set({ priority: action.priority, updatedAt: new Date() })
        .where(
          and(
            eq(conversations.id, ctx.conversationId),
            eq(conversations.organizationId, ctx.organizationId),
          ),
        )
        .returning();
      if (!updated) throw new NotFoundError("Conversation not found.");
      return { type: action.type, ok: true };
    }

    case "assign_conversation": {
      if (!ctx.conversationId) {
        return { type: action.type, ok: false, detail: "no_conversation" };
      }
      // Target membership must be active in same org
      const [target] = await db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.id, action.membershipId),
            eq(memberships.organizationId, ctx.organizationId),
            eq(memberships.status, "ACTIVE"),
          ),
        )
        .limit(1);
      if (!target) {
        throw new ValidationError(
          "Assignee must be an active member of this organization.",
        );
      }

      await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT id FROM conversations WHERE id = ${ctx.conversationId} AND organization_id = ${ctx.organizationId} FOR UPDATE`,
        );
        const locked = await tx
          .select()
          .from(conversations)
          .where(
            and(
              eq(conversations.id, ctx.conversationId!),
              eq(conversations.organizationId, ctx.organizationId),
            ),
          )
          .limit(1);
        const current = locked[0];
        if (!current) throw new NotFoundError("Conversation not found.");

        const previous = current.assignedToMembershipId ?? null;
        if (previous === action.membershipId) {
          return;
        }

        await tx
          .update(conversationAssignments)
          .set({ unassignedAt: new Date() })
          .where(
            and(
              eq(conversationAssignments.conversationId, ctx.conversationId!),
              isNull(conversationAssignments.unassignedAt),
            ),
          );

        await tx.insert(conversationAssignments).values({
          conversationId: ctx.conversationId!,
          membershipId: action.membershipId,
          assignedByMembershipId: ctx.actorMembershipId ?? null,
        });

        await tx
          .update(conversations)
          .set({
            assignedToMembershipId: action.membershipId,
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, ctx.conversationId!));

        await tx.insert(conversationAssignmentHistory).values({
          organizationId: ctx.organizationId,
          conversationId: ctx.conversationId!,
          actorMembershipId: ctx.actorMembershipId ?? null,
          previousMembershipId: previous,
          newMembershipId: action.membershipId,
          action: previous === null ? "ASSIGN" : "REASSIGN",
        });
      });
      return { type: action.type, ok: true };
    }

    case "add_tag": {
      if (!ctx.conversationId) {
        return { type: action.type, ok: false, detail: "no_conversation" };
      }
      const [tag] = await db
        .select()
        .from(conversationTags)
        .where(
          and(
            eq(conversationTags.id, action.tagId),
            eq(conversationTags.organizationId, ctx.organizationId),
          ),
        )
        .limit(1);
      if (!tag) throw new NotFoundError("Tag not found.");

      // Confirm conversation org
      const [conv] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.id, ctx.conversationId),
            eq(conversations.organizationId, ctx.organizationId),
          ),
        )
        .limit(1);
      if (!conv) throw new NotFoundError("Conversation not found.");

      try {
        await db.insert(conversationTagLinks).values({
          conversationId: ctx.conversationId,
          tagId: action.tagId,
        });
      } catch (e) {
        if (isUniqueViolation(e)) {
          return { type: action.type, ok: true, detail: "already_linked" };
        }
        throw e;
      }
      return { type: action.type, ok: true };
    }

    case "remove_tag": {
      if (!ctx.conversationId) {
        return { type: action.type, ok: false, detail: "no_conversation" };
      }
      await db
        .delete(conversationTagLinks)
        .where(
          and(
            eq(conversationTagLinks.conversationId, ctx.conversationId),
            eq(conversationTagLinks.tagId, action.tagId),
          ),
        );
      return { type: action.type, ok: true };
    }

    case "add_customer_tag": {
      if (!ctx.customerId) {
        return { type: action.type, ok: false, detail: "no_customer" };
      }
      const [tag] = await db
        .select()
        .from(conversationTags)
        .where(
          and(
            eq(conversationTags.id, action.tagId),
            eq(conversationTags.organizationId, ctx.organizationId),
          ),
        )
        .limit(1);
      if (!tag) throw new NotFoundError("Customer tag not found.");
      try {
        await db.insert(customerTagLinks).values({
          customerId: ctx.customerId,
          tagId: action.tagId,
          organizationId: ctx.organizationId,
        });
      } catch (e) {
        if (isUniqueViolation(e)) {
          return { type: action.type, ok: true, detail: "already_linked" };
        }
        throw e;
      }
      return { type: action.type, ok: true };
    }

    case "remove_customer_tag": {
      if (!ctx.customerId) {
        return { type: action.type, ok: false, detail: "no_customer" };
      }
      await db
        .delete(customerTagLinks)
        .where(
          and(
            eq(customerTagLinks.customerId, ctx.customerId),
            eq(customerTagLinks.tagId, action.tagId),
          ),
        );
      return { type: action.type, ok: true };
    }

    case "add_internal_note": {
      if (!ctx.conversationId) {
        return { type: action.type, ok: false, detail: "no_conversation" };
      }
      if (!ctx.actorMembershipId) {
        return { type: action.type, ok: false, detail: "no_actor_membership" };
      }
      // Verify actor membership is in org
      const [actor] = await db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.id, ctx.actorMembershipId),
            eq(memberships.organizationId, ctx.organizationId),
          ),
        )
        .limit(1);
      if (!actor) {
        return { type: action.type, ok: false, detail: "invalid_actor" };
      }
      await db.insert(conversationNotes).values({
        conversationId: ctx.conversationId,
        authorMembershipId: ctx.actorMembershipId,
        body: `[automation] ${action.body.slice(0, 3900)}`,
      });
      return { type: action.type, ok: true };
    }

    default:
      throw new ValidationError("Unsupported automation action.");
  }
}
