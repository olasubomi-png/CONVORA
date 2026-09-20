import type { VerificationStatus } from "@/db/schema";
import type { AuditEventType } from "@/db/schema";
import { ValidationError } from "@/lib/errors";

/**
 * Phase 2 administrative verification transitions.
 *
 * Allowed:
 *   UNVERIFIED → PENDING | VERIFIED | SUSPENDED
 *   PENDING    → VERIFIED | SUSPENDED | UNVERIFIED
 *   VERIFIED   → SUSPENDED | PENDING
 *   SUSPENDED  → VERIFIED | UNVERIFIED | PENDING
 */
const ALLOWED: Record<VerificationStatus, readonly VerificationStatus[]> = {
  UNVERIFIED: ["PENDING", "VERIFIED", "SUSPENDED"],
  PENDING: ["VERIFIED", "SUSPENDED", "UNVERIFIED"],
  VERIFIED: ["SUSPENDED", "PENDING"],
  SUSPENDED: ["VERIFIED", "UNVERIFIED", "PENDING"],
};

export function assertValidVerificationTransition(
  from: VerificationStatus,
  to: VerificationStatus,
): void {
  if (from === to) {
    return;
  }
  if (!ALLOWED[from].includes(to)) {
    throw new ValidationError(
      `Invalid verification transition from ${from} to ${to}.`,
    );
  }
}

export function verificationAuditEventType(
  status: VerificationStatus,
  kind: "agent" | "organization",
): AuditEventType {
  if (kind === "agent") {
    if (status === "VERIFIED") return "AGENT_VERIFIED";
    if (status === "SUSPENDED") return "AGENT_VERIFICATION_SUSPENDED";
    if (status === "PENDING") return "AGENT_VERIFICATION_REQUESTED";
    return "AGENT_PROFILE_UPDATED";
  }
  if (status === "VERIFIED") return "ORGANIZATION_VERIFIED";
  if (status === "SUSPENDED") return "ORGANIZATION_VERIFICATION_SUSPENDED";
  return "ORGANIZATION_PROFILE_UPDATED";
}
