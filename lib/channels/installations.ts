import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { channelInstallations } from "@/db/schema";
import { getActiveMembership } from "@/lib/authz/membership";
import { isAdminRole } from "@/lib/authz/roles";
import { recordAuditEvent } from "@/lib/audit";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

const ALLOWED_CHANNELS = [
  "WEB",
  "WHATSAPP",
  "FACEBOOK",
  "INSTAGRAM",
  "EMAIL",
  "SMS",
  "OTHER",
] as const;

export async function createChannelInstallation(
  actorUserId: string,
  organizationId: string,
  input: {
    channel: string;
    provider: string;
    displayName: string;
    publicConfig?: Record<string, unknown>;
    encryptedConfig?: Record<string, unknown>;
  },
) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership || !isAdminRole(membership.role)) {
    throw new AuthorizationError(
      "Only admins or owners can manage channel installations.",
    );
  }
  if (!ALLOWED_CHANNELS.includes(input.channel as (typeof ALLOWED_CHANNELS)[number])) {
    throw new ValidationError("Unsupported channel.");
  }
  const displayName = input.displayName.trim();
  if (!displayName || displayName.length > 120) {
    throw new ValidationError("displayName is required (max 120).");
  }

  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(channelInstallations)
      .values({
        organizationId,
        channel: input.channel,
        provider: input.provider.trim(),
        displayName,
        publicConfig: input.publicConfig ?? {},
        encryptedConfig: input.encryptedConfig ?? {},
      })
      .returning();
    if (!row) throw new Error("Failed to create channel installation");

    await recordAuditEvent(
      {
        eventType: "CHANNEL_INSTALLATION_CREATED",
        actorUserId,
        organizationId,
        payload: {
          installationId: row.id,
          channel: row.channel,
          provider: row.provider,
        },
      },
      tx,
    );

    return sanitizeInstallation(row);
  });
}

export function sanitizeInstallation(
  row: typeof channelInstallations.$inferSelect,
) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    channel: row.channel,
    provider: row.provider,
    displayName: row.displayName,
    status: row.status,
    publicConfig: row.publicConfig,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // encryptedConfig intentionally omitted
  };
}

export async function listChannelInstallations(
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
  const rows = await db
    .select()
    .from(channelInstallations)
    .where(eq(channelInstallations.organizationId, organizationId));
  return rows.map(sanitizeInstallation);
}

export async function updateChannelInstallationStatus(
  actorUserId: string,
  installationId: string,
  status: "ACTIVE" | "DISABLED" | "ERROR",
) {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(channelInstallations)
    .where(eq(channelInstallations.id, installationId))
    .limit(1);
  const installation = rows[0];
  if (!installation) throw new NotFoundError("Installation not found.");

  const membership = await getActiveMembership(
    actorUserId,
    installation.organizationId,
  );
  if (!membership || !isAdminRole(membership.role)) {
    throw new AuthorizationError(
      "Only admins or owners can manage channel installations.",
    );
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(channelInstallations)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(channelInstallations.id, installationId),
          eq(channelInstallations.organizationId, installation.organizationId),
        ),
      )
      .returning();

    await recordAuditEvent(
      {
        eventType:
          status === "DISABLED"
            ? "CHANNEL_INSTALLATION_DISABLED"
            : status === "ACTIVE"
              ? "CHANNEL_INSTALLATION_ENABLED"
              : "CHANNEL_INSTALLATION_UPDATED",
        actorUserId,
        organizationId: installation.organizationId,
        payload: { installationId, status },
      },
      tx,
    );

    return updated ? sanitizeInstallation(updated) : null;
  });
}

export async function getInstallationForOrg(
  organizationId: string,
  installationId: string,
) {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(channelInstallations)
    .where(
      and(
        eq(channelInstallations.id, installationId),
        eq(channelInstallations.organizationId, organizationId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
