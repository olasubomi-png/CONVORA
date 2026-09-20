import Link from "next/link";
import { requireAuthenticatedUser, getUserOrganizationContexts } from "@/lib/authz/context";
import { getOrganizationProfile } from "@/lib/profiles/organization";
import { saveOrganizationProfileAction } from "@/app/actions/profiles";
import { OrgProfileForm } from "@/components/profiles/org-profile-form";
import { Container } from "@/components/ui/container";
import { isAdminRole } from "@/lib/authz/roles";

export const metadata = { title: "Organization profile — CONVORA" };

export default async function OrgProfileManagePage() {
  const auth = await requireAuthenticatedUser();
  const memberships = await getUserOrganizationContexts(auth.user.id);
  const primary = memberships[0];

  if (!primary) {
    return (
      <Container className="py-12">
        <h1 className="text-2xl tracking-tight">Organization profile</h1>
        <p className="mt-2 text-sm text-[#5c5c5c]">Create an organization first.</p>
        <Link href="/app/organization" className="mt-4 inline-block text-sm text-[#1f4e3d] hover:underline">
          Create organization
        </Link>
      </Container>
    );
  }

  if (!isAdminRole(primary.role)) {
    return (
      <Container className="py-12">
        <h1 className="text-2xl tracking-tight">Organization profile</h1>
        <p className="mt-2 text-sm text-[#5c5c5c]">
          Only organization admins and owners can edit the organization profile.
        </p>
      </Container>
    );
  }

  const profile = await getOrganizationProfile(primary.organizationId);

  return (
    <Container className="py-12">
      <h1 className="text-2xl tracking-tight">Organization profile</h1>
      <p className="mt-2 max-w-2xl text-sm text-[#5c5c5c]">
        Public identity for <strong>{primary.organizationName}</strong>. Private by default.
      </p>
      {profile?.visibility === "PUBLIC" ? (
        <p className="mt-3 text-sm">
          Public URL:{" "}
          <Link href={`/org/${primary.organizationSlug}`} className="text-[#1f4e3d] hover:underline">
            /org/{primary.organizationSlug}
          </Link>
        </p>
      ) : null}
      <div className="mt-8 max-w-lg border border-[#e4e4e2] bg-white p-6">
        <OrgProfileForm
          organizationId={primary.organizationId}
          action={saveOrganizationProfileAction}
          defaults={{
            displayName: profile?.displayName ?? primary.organizationName,
            description: profile?.description,
            location: profile?.location,
            serviceArea: profile?.serviceArea,
            websiteUrl: profile?.websiteUrl,
            publicEmail: profile?.publicEmail,
            publicPhone: profile?.publicPhone,
            visibility: profile?.visibility,
          }}
        />
      </div>
    </Container>
  );
}
