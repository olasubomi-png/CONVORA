import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { channelInstallations } from "@/db/schema";
import { getActiveMembership } from "@/lib/authz/membership";
import { isAdminRole } from "@/lib/authz/roles";
import { recordAuditEvent } from "@/lib/audit";
import {
  encryptJson,
  decryptJson,
  isEncryptedCiphertext,
} from "@/lib/crypto/secrets";
import {
  instagramCredentialsSchema,
  type InstagramCredentials,
} from "@/lib/channels/providers/instagram/schemas";
import { INSTAGRAM_MESSAGING_PROVIDER } from "@/lib/channels/providers/instagram/adapter";
import { sanitizeInstallation } from "@/lib/channels/installations";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

export async function createInstagramInstallation(
  actorUserId: string,
  organizationId: string,
  input: {
    displayName: string;
    credentials: InstagramCredentials;
  },
) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership || !isAdminRole(membership.role)) {
    throw new AuthorizationError(
      "Only admins or owners can manage Instagram installations.",
    );
  }

  const creds = instagramCredentialsSchema.parse(input.credentials);
  const displayName = input.displayName.trim();
  if (!displayName || displayName.length > 120) {
    throw new ValidationError("displayName is required (max 120).");
  }

  const ciphertext = encryptJson(creds as unknown as Record<string, unknown>);
  const db = getDatabase();

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(channelInstallations)
      .values({
        organizationId,
        channel: "INSTAGRAM",
        provider: INSTAGRAM_MESSAGING_PROVIDER,
        displayName,
        providerResourceId: creds.instagramAccountId,
        publicConfig: {
          instagramAccountId: creds.instagramAccountId,
          pageId: creds.pageId ?? null,
        },
        encryptedConfig: { ciphertext },
      })
      .returning();
    if (!row) throw new Error("Failed to create Instagram installation");

    await recordAuditEvent(
      {
        eventType: "CHANNEL_INSTALLATION_CREATED",
        actorUserId,
        organizationId,
        payload: {
          installationId: row.id,
          channel: "INSTAGRAM",
          provider: INSTAGRAM_MESSAGING_PROVIDER,
          instagramAccountId: creds.instagramAccountId,
        },
      },
      tx,
    );

    return sanitizeInstallation(row);
  });
}

export function loadInstagramCredentials(
  installation: typeof channelInstallations.$inferSelect,
): InstagramCredentials {
  const raw = installation.encryptedConfig as { ciphertext?: string };
  if (!raw?.ciphertext || !isEncryptedCiphertext(raw.ciphertext)) {
    throw new ValidationError("Instagram credentials are not configured.");
  }
  const json = decryptJson(raw.ciphertext);
  return instagramCredentialsSchema.parse(json);
}

export async function getInstagramInstallationByAccountId(accountId: string) {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(channelInstallations)
    .where(
      and(
        eq(channelInstallations.provider, INSTAGRAM_MESSAGING_PROVIDER),
        eq(channelInstallations.providerResourceId, accountId),
        eq(channelInstallations.status, "ACTIVE"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getInstagramInstallationForOrg(
  actorUserId: string,
  organizationId: string,
  installationId: string,
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
    .where(
      and(
        eq(channelInstallations.id, installationId),
        eq(channelInstallations.organizationId, organizationId),
        eq(channelInstallations.provider, INSTAGRAM_MESSAGING_PROVIDER),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError("Installation not found.");
  return sanitizeInstallation(row);
}
