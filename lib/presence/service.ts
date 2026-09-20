import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { agentPresence } from "@/db/schema";
import { getActiveMembership } from "@/lib/authz/membership";
import { recordAuditEvent } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  AuthorizationError,
  RateLimitError,
  ValidationError,
} from "@/lib/errors";

const PRESENCE = ["ONLINE", "AWAY", "OFFLINE"] as const;
type PresenceStatus = (typeof PRESENCE)[number];

/**
 * Set own presence. Manual AWAY/OFFLINE is authoritative until changed.
 * Heartbeat only refreshes lastSeenAt when status is ONLINE.
 */
export async function setOwnPresence(
  actorUserId: string,
  organizationId: string,
  status: PresenceStatus,
) {
  if (!PRESENCE.includes(status)) {
    throw new ValidationError("Invalid presence status.");
  }
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }

  const rl = checkRateLimit({
    key: `presence:${membership.id}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) throw new RateLimitError();

  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(agentPresence)
      .where(eq(agentPresence.membershipId, membership.id))
      .limit(1);

    const now = new Date();
    if (existing) {
      const [updated] = await tx
        .update(agentPresence)
        .set({ status, lastSeenAt: now, updatedAt: now })
        .where(
          and(
            eq(agentPresence.membershipId, membership.id),
            eq(agentPresence.organizationId, organizationId),
          ),
        )
        .returning();
      await recordAuditEvent(
        {
          eventType: "AGENT_PRESENCE_CHANGED",
          actorUserId,
          organizationId,
          payload: { membershipId: membership.id, status },
        },
        tx,
      );
      return updated;
    }

    const [created] = await tx
      .insert(agentPresence)
      .values({
        organizationId,
        membershipId: membership.id,
        status,
        lastSeenAt: now,
      })
      .returning();
    await recordAuditEvent(
      {
        eventType: "AGENT_PRESENCE_CHANGED",
        actorUserId,
        organizationId,
        payload: { membershipId: membership.id, status },
      },
      tx,
    );
    return created;
  });
}

/** Heartbeat: only updates lastSeenAt when currently ONLINE. */
export async function presenceHeartbeat(
  actorUserId: string,
  organizationId: string,
) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }
  const rl = checkRateLimit({
    key: `presence:hb:${membership.id}`,
    limit: 12,
    windowMs: 60_000,
  });
  if (!rl.allowed) throw new RateLimitError();

  const db = getDatabase();
  const [row] = await db
    .select()
    .from(agentPresence)
    .where(eq(agentPresence.membershipId, membership.id))
    .limit(1);
  if (!row || row.status !== "ONLINE") {
    return row ?? null;
  }
  const [updated] = await db
    .update(agentPresence)
    .set({ lastSeenAt: new Date(), updatedAt: new Date() })
    .where(eq(agentPresence.membershipId, membership.id))
    .returning();
  return updated;
}

export async function listOrgPresence(
  actorUserId: string,
  organizationId: string,
) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }
  const db = getDatabase();
  return db
    .select()
    .from(agentPresence)
    .where(eq(agentPresence.organizationId, organizationId));
}
