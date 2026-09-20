import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { webChatInstallations } from "@/db/schema";
import { getActiveMembership } from "@/lib/authz/membership";
import { isAdminRole } from "@/lib/authz/roles";
import { recordAuditEvent } from "@/lib/audit";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { generatePublicKey } from "@/lib/web-chat/crypto";

export type InstallationConfig = {
  displayName?: string;
  welcomeMessage?: string;
  launcherPosition?: "bottom-right" | "bottom-left";
  accentColor?: string;
  headerText?: string;
};

export async function createInstallation(
  actorUserId: string,
  organizationId: string,
  input: {
    name: string;
    allowedOrigins?: string[];
    config?: InstallationConfig;
  },
) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership || !isAdminRole(membership.role)) {
    throw new AuthorizationError(
      "Only admins or owners can manage Web Chat installations.",
    );
  }

  const name = input.name.trim();
  if (!name || name.length > 120) {
    throw new ValidationError("Installation name is required (max 120).");
  }

  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(webChatInstallations)
      .values({
        organizationId,
        publicKey: generatePublicKey(),
        name,
        allowedOrigins: input.allowedOrigins ?? [],
        config: input.config ?? {},
      })
      .returning();
    if (!row) throw new Error("Failed to create installation");

    await recordAuditEvent(
      {
        eventType: "WEB_CHAT_INSTALLATION_CREATED",
        actorUserId,
        organizationId,
        payload: { installationId: row.id },
      },
      tx,
    );

    return row;
  });
}

export async function listInstallations(
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
    .from(webChatInstallations)
    .where(eq(webChatInstallations.organizationId, organizationId));
}

export async function updateInstallation(
  actorUserId: string,
  installationId: string,
  input: {
    name?: string;
    status?: "ACTIVE" | "DISABLED";
    allowedOrigins?: string[];
    config?: InstallationConfig;
  },
) {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(webChatInstallations)
    .where(eq(webChatInstallations.id, installationId))
    .limit(1);
  const installation = rows[0];
  if (!installation) throw new NotFoundError("Installation not found.");

  const membership = await getActiveMembership(
    actorUserId,
    installation.organizationId,
  );
  if (!membership || !isAdminRole(membership.role)) {
    throw new AuthorizationError(
      "Only admins or owners can manage Web Chat installations.",
    );
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.status !== undefined) patch.status = input.status;
  if (input.allowedOrigins !== undefined) {
    patch.allowedOrigins = input.allowedOrigins;
  }
  if (input.config !== undefined) patch.config = input.config;

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(webChatInstallations)
      .set(patch)
      .where(
        and(
          eq(webChatInstallations.id, installationId),
          eq(
            webChatInstallations.organizationId,
            installation.organizationId,
          ),
        ),
      )
      .returning();

    const eventType =
      input.status === "DISABLED"
        ? "WEB_CHAT_INSTALLATION_DISABLED"
        : input.status === "ACTIVE"
          ? "WEB_CHAT_INSTALLATION_ENABLED"
          : "WEB_CHAT_INSTALLATION_UPDATED";

    await recordAuditEvent(
      {
        eventType,
        actorUserId,
        organizationId: installation.organizationId,
        payload: { installationId },
      },
      tx,
    );

    return updated;
  });
}

export async function deleteInstallation(
  actorUserId: string,
  installationId: string,
) {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(webChatInstallations)
    .where(eq(webChatInstallations.id, installationId))
    .limit(1);
  const installation = rows[0];
  if (!installation) throw new NotFoundError("Installation not found.");

  const membership = await getActiveMembership(
    actorUserId,
    installation.organizationId,
  );
  if (!membership || !isAdminRole(membership.role)) {
    throw new AuthorizationError(
      "Only admins or owners can manage Web Chat installations.",
    );
  }

  return db.transaction(async (tx) => {
    await tx
      .delete(webChatInstallations)
      .where(eq(webChatInstallations.id, installationId));
    await recordAuditEvent(
      {
        eventType: "WEB_CHAT_INSTALLATION_DELETED",
        actorUserId,
        organizationId: installation.organizationId,
        payload: { installationId },
      },
      tx,
    );
  });
}

export async function resolveActiveInstallationByPublicKey(publicKey: string) {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(webChatInstallations)
    .where(eq(webChatInstallations.publicKey, publicKey))
    .limit(1);
  const installation = rows[0];
  if (!installation || installation.status !== "ACTIVE") {
    throw new NotFoundError("Installation not found.");
  }
  return installation;
}

export function assertOriginAllowed(
  installation: { allowedOrigins: string[] },
  origin: string | null,
): void {
  if (!installation.allowedOrigins.length) return;
  if (!origin || !installation.allowedOrigins.includes(origin)) {
    throw new AuthorizationError("Origin is not allowed for this installation.");
  }
}
