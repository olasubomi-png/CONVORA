import Link from "next/link";
import { requireAuthenticatedUser, getUserOrganizationContexts } from "@/lib/authz/context";
import { getAgentProfileForMembership } from "@/lib/profiles/agent";
import { saveAgentProfileAction } from "@/app/actions/profiles";
import { AgentProfileForm } from "@/components/profiles/agent-profile-form";
import { Container } from "@/components/ui/container";

export const metadata = { title: "Agent profile — CONVORA" };

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
        <Link href="/app/organization" className="mt-4 inline-block text-sm text-[#1f4e3d] hover:underline">
          Create organization
        </Link>
      </Container>
    );
  }

  const profile = await getAgentProfileForMembership(primary.id);

  return (
    <Container className="py-12">
      <h1 className="text-2xl tracking-tight">Agent profile</h1>
      <p className="mt-2 max-w-2xl text-sm text-[#5c5c5c]">
        Your public professional identity for{" "}
        <strong>{primary.organizationName}</strong>. Profiles are private until you set
        visibility to public. Verification is separate from posts.
      </p>
      {profile?.visibility === "PUBLIC" ? (
        <p className="mt-3 text-sm">
          Public URL:{" "}
          <Link href={`/agents/${profile.publicUsername}`} className="text-[#1f4e3d] hover:underline">
            /@{profile.publicUsername}
          </Link>
        </p>
      ) : null}
      <div className="mt-8 max-w-lg border border-[#e4e4e2] bg-white p-6">
        <AgentProfileForm
          organizationId={primary.organizationId}
          action={saveAgentProfileAction}
          defaults={{
            publicUsername: profile?.publicUsername,
            displayName: profile?.displayName ?? auth.user.fullName,
            professionalTitle: profile?.professionalTitle,
            bio: profile?.bio,
            location: profile?.location,
            serviceArea: profile?.serviceArea,
            yearsExperience: profile?.yearsExperience,
            visibility: profile?.visibility,
          }}
        />
      </div>
    </Container>
  );
}
