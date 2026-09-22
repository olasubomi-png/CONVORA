import { and, desc, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  organizations,
  organizationProfiles,
  webChatInstallations,
} from "@/db/schema";

export type PublicWebChatEmbed = {
  publicKey: string;
  displayName: string;
  welcomeMessage: string | null;
  headerText: string | null;
};

/**
 * Returns public Web Chat embed config only when:
 * - organization is ACTIVE
 * - organization profile is PUBLIC (not SUSPENDED)
 * - an ACTIVE Web Chat installation exists
 *
 * Never returns installation IDs, secrets, or internal org UUIDs.
 */
export async function getPublicWebChatEmbedByOrgSlug(
  slug: string,
): Promise<PublicWebChatEmbed | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;

  const db = getDatabase();
  const rows = await db
    .select({
      orgStatus: organizations.status,
      visibility: organizationProfiles.visibility,
      verificationStatus: organizationProfiles.verificationStatus,
      orgName: organizations.name,
      profileDisplayName: organizationProfiles.displayName,
      publicKey: webChatInstallations.publicKey,
      installationStatus: webChatInstallations.status,
      config: webChatInstallations.config,
      installationName: webChatInstallations.name,
    })
    .from(organizations)
    .innerJoin(
      organizationProfiles,
      eq(organizationProfiles.organizationId, organizations.id),
    )
    .innerJoin(
      webChatInstallations,
      eq(webChatInstallations.organizationId, organizations.id),
    )
    .where(
      and(
        eq(organizations.slug, normalized),
        eq(organizations.status, "ACTIVE"),
        eq(organizationProfiles.visibility, "PUBLIC"),
        eq(webChatInstallations.status, "ACTIVE"),
      ),
    )
    .orderBy(desc(webChatInstallations.isDefault))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.verificationStatus === "SUSPENDED") return null;

  const config = (row.config ?? {}) as {
    displayName?: string;
    welcomeMessage?: string;
    headerText?: string;
  };

  return {
    publicKey: row.publicKey,
    displayName:
      config.displayName ??
      row.profileDisplayName ??
      row.orgName ??
      row.installationName,
    welcomeMessage: config.welcomeMessage ?? null,
    headerText: config.headerText ?? null,
  };
}
