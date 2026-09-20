import type { ConversationStatus } from "@/db/schema";
import { ValidationError } from "@/lib/errors";

/**
 * OPEN — actively being worked
 * PENDING — waiting on customer or external input
 * CLOSED — resolved; may be reopened
 */
const ALLOWED: Record<ConversationStatus, readonly ConversationStatus[]> = {
  OPEN: ["PENDING", "CLOSED"],
  PENDING: ["OPEN", "CLOSED"],
  CLOSED: ["OPEN"],
};

export function assertValidStatusTransition(
  from: ConversationStatus,
  to: ConversationStatus,
): void {
  if (from === to) return;
  if (!ALLOWED[from].includes(to)) {
    throw new ValidationError(
      `Invalid conversation status transition from ${from} to ${to}.`,
    );
  }
}
