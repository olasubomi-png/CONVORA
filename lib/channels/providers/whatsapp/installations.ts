import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { channelInstallations } from "@/db/schema";
import { getActiveMembership } from "@/lib/authz/membership";
import { isAdminRole } from "@/lib/authz/roles";
import { recordAuditEvent } from "@/lib/audit";
import { encryptJson, decryptJson, isEncryptedCiphertext } from "@/lib/crypto/secrets";
import {
  whatsappCredentialsSchema,
  type WhatsAppCredentials,
} from "@/lib/channels/providers/whatsapp/schemas";
import { WHATSAPP_CLOUD_PROVIDER } from "@/lib/channels/providers/whatsapp/adapter";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { sanitizeInstallation } from "@/lib/channels/installations";

export async function createWhatsAppInstallation(
  actorUserId: string,
  organizationId: string,
  input: {
    displayName: string;
    credentials: WhatsAppCredentials;
  },
) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership || !isAdminRole(membership.role)) {
    throw new AuthorizationError(
      "Only admins or owners can manage WhatsApp installations.",
    );
  }

  const creds = whatsappCredentialsSchema.parse(input.credentials);
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
        channel: "WHATSAPP",
        provider: WHATSAPP_CLOUD_PROVIDER,
        displayName,
        providerResourceId: creds.phoneNumberId,
        publicConfig: {
          phoneNumberId: creds.phoneNumberId,
          businessAccountId: creds.businessAccountId ?? null,
        },
        encryptedConfig: { ciphertext },
      })
      .returning();
    if (!row) throw new Error("Failed to create WhatsApp installation");

    await recordAuditEvent(
      {
        eventType: "CHANNEL_INSTALLATION_CREATED",
        actorUserId,
        organizationId,
        payload: {
          installationId: row.id,
          channel: "WHATSAPP",
          provider: WHATSAPP_CLOUD_PROVIDER,
        },
      },
      tx,
    );

    return sanitizeInstallation(row);
  });
}

export function loadWhatsAppCredentials(
  installation: typeof channelInstallations.$inferSelect,
): WhatsAppCredentials {
  const raw = installation.encryptedConfig as { ciphertext?: string };
  if (!raw?.ciphertext || !isEncryptedCiphertext(raw.ciphertext)) {
    throw new ValidationError("WhatsApp credentials are not configured.");
  }
  const json = decryptJson(raw.ciphertext);
  return whatsappCredentialsSchema.parse(json);
}

export async function getWhatsAppInstallationByPhoneNumberId(
  phoneNumberId: string,
) {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(channelInstallations)
    .where(
      and(
        eq(channelInstallations.provider, WHATSAPP_CLOUD_PROVIDER),
        eq(channelInstallations.providerResourceId, phoneNumberId),
        eq(channelInstallations.status, "ACTIVE"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function rotateWhatsAppCredentials(
  actorUserId: string,
  installationId: string,
  credentials: WhatsAppCredentials,
) {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(channelInstallations)
    .where(eq(channelInstallations.id, installationId))
    .limit(1);
  const installation = rows[0];
  if (!installation || installation.provider !== WHATSAPP_CLOUD_PROVIDER) {
    throw new NotFoundError("Installation not found.");
  }

  const membership = await getActiveMembership(
    actorUserId,
    installation.organizationId,
  );
  if (!membership || !isAdminRole(membership.role)) {
    throw new AuthorizationError(
      "Only admins or owners can rotate WhatsApp credentials.",
    );
  }

  const creds = whatsappCredentialsSchema.parse(credentials);
  const ciphertext = encryptJson(creds as unknown as Record<string, unknown>);

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(channelInstallations)
      .set({
        encryptedConfig: { ciphertext },
        providerResourceId: creds.phoneNumberId,
        publicConfig: {
          phoneNumberId: creds.phoneNumberId,
          businessAccountId: creds.businessAccountId ?? null,
        },
        updatedAt: new Date(),
      })
      .where(eq(channelInstallations.id, installationId))
      .returning();

    await recordAuditEvent(
      {
        eventType: "CHANNEL_INSTALLATION_UPDATED",
        actorUserId,
        organizationId: installation.organizationId,
        payload: {
          installationId,
          action: "credentials_rotated",
        },
      },
      tx,
    );

    return updated ? sanitizeInstallation(updated) : null;
  });
}
