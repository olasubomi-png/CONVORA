import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { aiSuggestions } from "@/db/schema";
import { getActiveMembership } from "@/lib/authz/membership";
import { recordAuditEvent } from "@/lib/audit";
import {
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

export async function resolveSuggestion(
  actorUserId: string,
  suggestionId: string,
  action: "ACCEPT" | "REJECT" | "DISMISS",
) {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(aiSuggestions)
    .where(eq(aiSuggestions.id, suggestionId))
    .limit(1);
  const suggestion = rows[0];
  if (!suggestion) {
    throw new NotFoundError("Suggestion not found.");
  }

  const membership = await getActiveMembership(
    actorUserId,
    suggestion.organizationId,
  );
  if (!membership) {
    throw new NotFoundError("Suggestion not found.");
  }

  if (suggestion.status !== "PENDING") {
    throw new ValidationError("Suggestion has already been resolved.");
  }

  const status =
    action === "ACCEPT"
      ? "ACCEPTED"
      : action === "REJECT"
        ? "REJECTED"
        : "DISMISSED";

  const [updated] = await db
    .update(aiSuggestions)
    .set({
      status,
      resolvedAt: new Date(),
      resolvedByMembershipId: membership.id,
    })
    .where(
      and(
        eq(aiSuggestions.id, suggestionId),
        eq(aiSuggestions.organizationId, suggestion.organizationId),
      ),
    )
    .returning();

  await recordAuditEvent({
    eventType:
      action === "ACCEPT" ? "AI_SUGGESTION_ACCEPTED" : "AI_SUGGESTION_REJECTED",
    actorUserId,
    organizationId: suggestion.organizationId,
    payload: {
      suggestionId,
      suggestionType: suggestion.suggestionType,
      action,
    },
  });

  return updated;
}
