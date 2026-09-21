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
  facebookCredentialsSchema,
  type FacebookCredentials,
} from "@/lib/channels/providers/facebook/schemas";
import { FACEBOOK_MESSENGER_PROVIDER } from "@/lib/channels/providers/facebook/adapter";
import { sanitizeInstallation } from "@/lib/channels/installations";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

export async function createFacebookInstallation(
  actorUserId: string,
  organizationId: string,
  input: {
    displayName: string;
    credentials: FacebookCredentials;
  },
) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership || !isAdminRole(membership.role)) {
    throw new AuthorizationError(
      "Only admins or owners can manage Facebook installations.",
    );
  }

  const creds = facebookCredentialsSchema.parse(input.credentials);
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
        channel: "FACEBOOK",
        provider: FACEBOOK_MESSENGER_PROVIDER,
        displayName,
        providerResourceId: creds.pageId,
        publicConfig: {
          pageId: creds.pageId,
        },
        encryptedConfig: { ciphertext },
      })
      .returning();
    if (!row) throw new Error("Failed to create Facebook installation");

    await recordAuditEvent(
      {
        eventType: "CHANNEL_INSTALLATION_CREATED",
        actorUserId,
        organizationId,
        payload: {
          installationId: row.id,
          channel: "FACEBOOK",
          provider: FACEBOOK_MESSENGER_PROVIDER,
          pageId: creds.pageId,
        },
      },
      tx,
    );

    return sanitizeInstallation(row);
  });
}

export function loadFacebookCredentials(
  installation: typeof channelInstallations.$inferSelect,
): FacebookCredentials {
  const raw = installation.encryptedConfig as { ciphertext?: string };
  if (!raw?.ciphertext || !isEncryptedCiphertext(raw.ciphertext)) {
    throw new ValidationError("Facebook credentials are not configured.");
  }
  const json = decryptJson(raw.ciphertext);
  return facebookCredentialsSchema.parse(json);
}

export async function getFacebookInstallationByPageId(pageId: string) {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(channelInstallations)
    .where(
      and(
        eq(channelInstallations.provider, FACEBOOK_MESSENGER_PROVIDER),
        eq(channelInstallations.providerResourceId, pageId),
        eq(channelInstallations.status, "ACTIVE"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getFacebookInstallationForOrg(
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
        eq(channelInstallations.provider, FACEBOOK_MESSENGER_PROVIDER),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError("Installation not found.");
  return sanitizeInstallation(row);
}
