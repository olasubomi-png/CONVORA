import type { AgentPostVisibility } from "@/db/schema";
import { ValidationError } from "@/lib/errors";

/**
 * Post visibility lifecycle (Phase 2):
 *
 *   DRAFT → PUBLIC | ARCHIVED
 *   PUBLIC → ARCHIVED | DRAFT
 *   ARCHIVED → PUBLIC | DRAFT
 *
 * publishedAt policy:
 * - First transition to PUBLIC sets publishedAt to now (if null).
 * - ARCHIVED and DRAFT preserve historical publishedAt.
 * - Re-publish (ARCHIVED/DRAFT → PUBLIC) keeps original publishedAt when set.
 */
const ALLOWED: Record<
  AgentPostVisibility,
  readonly AgentPostVisibility[]
> = {
  DRAFT: ["PUBLIC", "ARCHIVED"],
  PUBLIC: ["ARCHIVED", "DRAFT"],
  ARCHIVED: ["PUBLIC", "DRAFT"],
};

export function assertValidPostVisibilityTransition(
  from: AgentPostVisibility,
  to: AgentPostVisibility,
): void {
  if (from === to) {
    return;
  }
  if (!ALLOWED[from].includes(to)) {
    throw new ValidationError(
      `Invalid post visibility transition from ${from} to ${to}.`,
    );
  }
}

export function nextPublishedAt(
  from: AgentPostVisibility,
  to: AgentPostVisibility,
  previousPublishedAt: Date | null,
): Date | null {
  if (to === "PUBLIC") {
    return previousPublishedAt ?? new Date();
  }
  // DRAFT / ARCHIVED: preserve history
  return previousPublishedAt;
}
