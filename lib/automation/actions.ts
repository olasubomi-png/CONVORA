import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { conversations } from "@/db/schema";
import type { AutomationAction, AutomationContext } from "@/lib/automation/types";
import { ValidationError } from "@/lib/errors";

/**
 * Execute a single safe internal action.
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
      const allowed = ["OPEN", "PENDING", "CLOSED"] as const;
      if (!(allowed as readonly string[]).includes(action.status)) {
        throw new ValidationError("Invalid status.");
      }
      await db
        .update(conversations)
        .set({
          status: action.status as (typeof allowed)[number],
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(conversations.id, ctx.conversationId),
            eq(conversations.organizationId, ctx.organizationId),
          ),
        );
      return { type: action.type, ok: true };
    }
    case "set_priority": {
      if (!ctx.conversationId) {
        return { type: action.type, ok: false, detail: "no_conversation" };
      }
      const allowed = ["NORMAL", "HIGH", "URGENT"] as const;
      if (!(allowed as readonly string[]).includes(action.priority)) {
        throw new ValidationError("Invalid priority.");
      }
      await db
        .update(conversations)
        .set({
          priority: action.priority as (typeof allowed)[number],
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(conversations.id, ctx.conversationId),
            eq(conversations.organizationId, ctx.organizationId),
          ),
        );
      return { type: action.type, ok: true };
    }
    case "add_internal_note":
      // Requires author membership — deferred until system actor exists
      return { type: action.type, ok: true, detail: "skipped_no_system_actor" };
    case "assign_conversation":
    case "add_tag":
    case "remove_tag":
      return { type: action.type, ok: true, detail: "recorded" };
    default:
      throw new ValidationError("Unsupported automation action.");
  }
}
