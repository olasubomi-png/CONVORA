import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { aiSuggestions } from "@/db/schema";
import { getActiveMembership } from "@/lib/authz/membership";
import { recordAuditEvent } from "@/lib/audit";
import { NotFoundError, ConflictError } from "@/lib/errors";

/**
 * Atomically transition a PENDING suggestion.
 * Concurrent resolvers: exactly one wins (WHERE status = PENDING).
 * Audit participates in the same transaction.
 */
export async function resolveSuggestion(
  actorUserId: string,
  suggestionId: string,
  action: "ACCEPT" | "REJECT" | "DISMISS",
) {
  const db = getDatabase();

  // Pre-auth: load org id without trusting client (non-disclosure)
  const existing = await db
    .select({
      id: aiSuggestions.id,
      organizationId: aiSuggestions.organizationId,
      status: aiSuggestions.status,
      suggestionType: aiSuggestions.suggestionType,
    })
    .from(aiSuggestions)
    .where(eq(aiSuggestions.id, suggestionId))
    .limit(1);

  const row = existing[0];
  if (!row) {
    throw new NotFoundError("Suggestion not found.");
  }

  const membership = await getActiveMembership(
    actorUserId,
    row.organizationId,
  );
  if (!membership) {
    throw new NotFoundError("Suggestion not found.");
  }

  const status =
    action === "ACCEPT"
      ? "ACCEPTED"
      : action === "REJECT"
        ? "REJECTED"
        : "DISMISSED";

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(aiSuggestions)
      .set({
        status,
        resolvedAt: new Date(),
        resolvedByMembershipId: membership.id,
      })
      .where(
        and(
          eq(aiSuggestions.id, suggestionId),
          eq(aiSuggestions.organizationId, row.organizationId),
          eq(aiSuggestions.status, "PENDING"),
        ),
      )
      .returning();

    if (!updated) {
      // Lost the race or already resolved
      throw new ConflictError("Suggestion has already been resolved.");
    }

    const auditType =
      action === "ACCEPT"
        ? "AI_SUGGESTION_ACCEPTED"
        : action === "REJECT"
          ? "AI_SUGGESTION_REJECTED"
          : "AI_SUGGESTION_REJECTED"; // DISMISS uses rejected audit category

    await recordAuditEvent(
      {
        eventType: auditType,
        actorUserId,
        organizationId: row.organizationId,
        payload: {
          suggestionId,
          suggestionType: row.suggestionType,
          action,
        },
      },
      tx,
    );

    return updated;
  });
}
