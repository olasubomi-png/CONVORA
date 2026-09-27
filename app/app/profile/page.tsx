import Link from "next/link";
import {
  requireAuthenticatedUser,
  getUserOrganizationContexts,
} from "@/lib/authz/context";
import { getAgentProfileForMembership } from "@/lib/profiles/agent";
import { listPostsForProfile } from "@/lib/posts/agent-posts";
import { saveAgentProfileAction } from "@/app/actions/profiles";
import { AgentProfileWorkspace } from "@/components/profiles/agent-profile-workspace";
import { Container } from "@/components/ui/container";

export const metadata = { title: "My profile — CONVORA" };

export default async function AgentProfileManagePage() {
  const auth = await requireAuthenticatedUser();
  const memberships = await getUserOrganizationContexts(auth.user.id);
  const primary = memberships[0];

  if (!primary) {
    return (
      <Container className="py-12">
        <h1 className="text-2xl tracking-tight">Agent profile</h1>
        <p className="mt-2 text-sm text-[#5c5c5c]">
          Create an organization first, then set up your public agent profile.
        </p>
        <Link
          href="/app/organization"
          className="mt-4 inline-block text-sm text-[#1f4e3d] hover:underline"
        >
          Create organization
        </Link>
      </Container>
    );
  }

  const profile = await getAgentProfileForMembership(primary.id);
  const posts = profile
    ? await listPostsForProfile(auth.user.id, profile.id)
    : [];

  return (
    <Container className="py-10">
      <AgentProfileWorkspace
        organizationId={primary.organizationId}
        organizationName={primary.organizationName}
        profileId={profile?.id ?? null}
        publicUsername={profile?.publicUsername ?? null}
        visibility={profile?.visibility ?? null}
        displayName={profile?.displayName ?? auth.user.fullName}
        professionalTitle={profile?.professionalTitle ?? null}
        avatarUrl={profile?.avatarUrl ?? null}
        profileDefaults={{
          publicUsername: profile?.publicUsername,
          displayName: profile?.displayName ?? auth.user.fullName,
          professionalTitle: profile?.professionalTitle,
          bio: profile?.bio,
          location: profile?.location,
          serviceArea: profile?.serviceArea,
          yearsExperience: profile?.yearsExperience,
          visibility: profile?.visibility,
        }}
        saveProfileAction={saveAgentProfileAction}
        initialPosts={posts.map((p) => ({
          id: p.id,
          body: p.body,
          type: p.type,
          mediaUrl: p.mediaUrl,
          visibility: p.visibility,
          publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
          createdAt: p.createdAt.toISOString(),
        }))}
      />
    </Container>
  );
}
