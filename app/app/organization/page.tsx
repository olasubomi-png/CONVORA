import { requireAuthenticatedUser, getUserOrganizationContexts, requireOrganizationMembership } from "@/lib/authz/context";
import type { ActiveMembership } from "@/lib/authz/membership";
import { createOrganizationAction } from "@/app/actions/organizations";
import { CreateOrgForm } from "@/components/create-org-form";
import { Container } from "@/components/ui/container";

export const metadata = { title: "Organization — CONVORA" };

type Props = { searchParams: Promise<{ org?: string }> };

export default async function OrganizationPage({ searchParams }: Props) {
  const auth = await requireAuthenticatedUser();
  const params = await searchParams;
  const memberships = await getUserOrganizationContexts(auth.user.id);
  let active: ActiveMembership | null = null;
  if (params.org) {
    try { active = (await requireOrganizationMembership(params.org)).membership; }
    catch { active = null; }
  } else if (memberships[0]) {
    active = memberships[0];
  }
  return (
    <Container className="py-12">
      <h1 className="text-2xl tracking-tight">Organization</h1>
      <p className="mt-2 max-w-2xl text-sm text-[#5c5c5c]">Organizations are the tenancy boundary. Membership role determines access.</p>
      {active ? (
        <section className="mt-10 border border-[#e4e4e2] bg-white p-6">
          <h2 className="text-lg">{active.organizationName}</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-[#5c5c5c]">Slug</dt><dd>{active.organizationSlug}</dd></div>
            <div><dt className="text-[#5c5c5c]">Your role</dt><dd>{active.role}</dd></div>
            <div><dt className="text-[#5c5c5c]">Membership</dt><dd>{active.status}</dd></div>
            <div><dt className="text-[#5c5c5c]">Organization status</dt><dd>{active.organizationStatus}</dd></div>
          </dl>
        </section>
      ) : null}
      <section className="mt-10 max-w-md">
        <h2 className="text-lg">Create organization</h2>
        <p className="mt-2 text-sm text-[#5c5c5c]">You become the OWNER of any organization you create.</p>
        <div className="mt-6 border border-[#e4e4e2] bg-white p-6">
          <CreateOrgForm action={createOrganizationAction} />
        </div>
      </section>
    </Container>
  );
}
