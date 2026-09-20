import type { VerificationStatus, ProfileVisibility } from "@/db/schema";

/** Public projection — never include internal IDs or private fields. */
export type PublicAgentProfile = {
  username: string;
  displayName: string;
  professionalTitle: string | null;
  bio: string | null;
  avatarUrl: string | null;
  location: string | null;
  serviceArea: string | null;
  yearsExperience: number | null;
  verificationStatus: VerificationStatus;
  organization: {
    slug: string;
    displayName: string;
    logoUrl: string | null;
    verificationStatus: VerificationStatus;
  };
  posts: PublicAgentPost[];
};

export type PublicAgentPost = {
  id: string;
  type: string;
  body: string;
  mediaUrl: string | null;
  publishedAt: string | null;
};

export type PublicOrganizationProfile = {
  slug: string;
  displayName: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  websiteUrl: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  location: string | null;
  serviceArea: string | null;
  verificationStatus: VerificationStatus;
  agents: Array<{
    username: string;
    displayName: string;
    professionalTitle: string | null;
    avatarUrl: string | null;
    verificationStatus: VerificationStatus;
  }>;
};

export type AgentProfileInput = {
  publicUsername: string;
  displayName: string;
  professionalTitle?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  location?: string | null;
  serviceArea?: string | null;
  yearsExperience?: number | null;
  visibility?: ProfileVisibility;
};

export type OrganizationProfileInput = {
  displayName: string;
  legalName?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  description?: string | null;
  websiteUrl?: string | null;
  publicEmail?: string | null;
  publicPhone?: string | null;
  location?: string | null;
  serviceArea?: string | null;
  visibility?: ProfileVisibility;
};
