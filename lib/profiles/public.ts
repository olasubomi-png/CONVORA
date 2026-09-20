import { and, desc, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  agentPosts,
  agentProfiles,
  memberships,
  organizationProfiles,
  organizations,
  users,
} from "@/db/schema";
import type {
  PublicAgentPost,
  PublicAgentProfile,
  PublicOrganizationProfile,
} from "@/lib/profiles/types";

/**
 * Active public agent chain:
 * user ACTIVE + membership ACTIVE + org ACTIVE + profile PUBLIC
 * Verification SUSPENDED hides the profile from public view.
 */
export async function getPublicAgentProfileByUsername(
  username: string,
): Promise<PublicAgentProfile | null> {
  const db = getDatabase();
  const normalized = username.trim().toLowerCase();

  const rows = await db
    .select({
      username: agentProfiles.publicUsername,
      displayName: agentProfiles.displayName,
      professionalTitle: agentProfiles.professionalTitle,
      bio: agentProfiles.bio,
      avatarUrl: agentProfiles.avatarUrl,
      location: agentProfiles.location,
      serviceArea: agentProfiles.serviceArea,
      yearsExperience: agentProfiles.yearsExperience,
      verificationStatus: agentProfiles.verificationStatus,
      visibility: agentProfiles.visibility,
      profileId: agentProfiles.id,
      membershipStatus: memberships.status,
      userStatus: users.status,
      orgStatus: organizations.status,
      orgSlug: organizations.slug,
      orgProfileDisplayName: organizationProfiles.displayName,
      orgName: organizations.name,
      orgLogo: organizationProfiles.logoUrl,
      orgVerification: organizationProfiles.verificationStatus,
      orgVisibility: organizationProfiles.visibility,
    })
    .from(agentProfiles)
    .innerJoin(memberships, eq(agentProfiles.membershipId, memberships.id))
    .innerJoin(users, eq(memberships.userId, users.id))
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .leftJoin(
      organizationProfiles,
      eq(organizationProfiles.organizationId, organizations.id),
    )
    .where(eq(agentProfiles.publicUsername, normalized))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (
    row.visibility !== "PUBLIC" ||
    row.membershipStatus !== "ACTIVE" ||
    row.userStatus !== "ACTIVE" ||
    row.orgStatus !== "ACTIVE" ||
    row.verificationStatus === "SUSPENDED"
  ) {
    // Non-disclosure: treat as not found
    return null;
  }

  const postRows = await db
    .select({
      id: agentPosts.id,
      type: agentPosts.type,
      body: agentPosts.body,
      mediaUrl: agentPosts.mediaUrl,
      publishedAt: agentPosts.publishedAt,
    })
    .from(agentPosts)
    .where(
      and(
        eq(agentPosts.agentProfileId, row.profileId),
        eq(agentPosts.visibility, "PUBLIC"),
      ),
    )
    .orderBy(desc(agentPosts.publishedAt))
    .limit(20);

  const posts: PublicAgentPost[] = postRows.map((p) => ({
    id: p.id,
    type: p.type,
    body: p.body,
    mediaUrl: p.mediaUrl,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
  }));

  return {
    username: row.username,
    displayName: row.displayName,
    professionalTitle: row.professionalTitle,
    bio: row.bio,
    avatarUrl: row.avatarUrl,
    location: row.location,
    serviceArea: row.serviceArea,
    yearsExperience: row.yearsExperience,
    verificationStatus: row.verificationStatus,
    organization: {
      slug: row.orgSlug,
      displayName: row.orgProfileDisplayName ?? row.orgName,
      logoUrl: row.orgLogo,
      verificationStatus: row.orgVerification ?? "UNVERIFIED",
    },
    posts,
  };
}

export async function getPublicOrganizationProfileBySlug(
  slug: string,
): Promise<PublicOrganizationProfile | null> {
  const db = getDatabase();
  const normalized = slug.trim().toLowerCase();

  const orgRows = await db
    .select({
      slug: organizations.slug,
      name: organizations.name,
      orgStatus: organizations.status,
      displayName: organizationProfiles.displayName,
      description: organizationProfiles.description,
      logoUrl: organizationProfiles.logoUrl,
      bannerUrl: organizationProfiles.bannerUrl,
      websiteUrl: organizationProfiles.websiteUrl,
      publicEmail: organizationProfiles.publicEmail,
      publicPhone: organizationProfiles.publicPhone,
      location: organizationProfiles.location,
      serviceArea: organizationProfiles.serviceArea,
      verificationStatus: organizationProfiles.verificationStatus,
      visibility: organizationProfiles.visibility,
      organizationId: organizations.id,
    })
    .from(organizations)
    .leftJoin(
      organizationProfiles,
      eq(organizationProfiles.organizationId, organizations.id),
    )
    .where(eq(organizations.slug, normalized))
    .limit(1);

  const org = orgRows[0];
  if (!org) return null;

  if (
    org.orgStatus !== "ACTIVE" ||
    !org.visibility ||
    org.visibility !== "PUBLIC" ||
    org.verificationStatus === "SUSPENDED"
  ) {
    return null;
  }

  const agentRows = await db
    .select({
      username: agentProfiles.publicUsername,
      displayName: agentProfiles.displayName,
      professionalTitle: agentProfiles.professionalTitle,
      avatarUrl: agentProfiles.avatarUrl,
      verificationStatus: agentProfiles.verificationStatus,
    })
    .from(agentProfiles)
    .innerJoin(memberships, eq(agentProfiles.membershipId, memberships.id))
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(
      and(
        eq(memberships.organizationId, org.organizationId),
        eq(memberships.status, "ACTIVE"),
        eq(users.status, "ACTIVE"),
        eq(agentProfiles.visibility, "PUBLIC"),
      ),
    );

  const agents = agentRows.filter((a) => a.verificationStatus !== "SUSPENDED");

  return {
    slug: org.slug,
    displayName: org.displayName ?? org.name,
    description: org.description,
    logoUrl: org.logoUrl,
    bannerUrl: org.bannerUrl,
    websiteUrl: org.websiteUrl,
    publicEmail: org.publicEmail,
    publicPhone: org.publicPhone,
    location: org.location,
    serviceArea: org.serviceArea,
    verificationStatus: org.verificationStatus ?? "UNVERIFIED",
    agents: agents.map((a) => ({
      username: a.username,
      displayName: a.displayName,
      professionalTitle: a.professionalTitle,
      avatarUrl: a.avatarUrl,
      verificationStatus: a.verificationStatus,
    })),
  };
}
