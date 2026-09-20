import Link from "next/link";
import { requireAuthenticatedUser, getUserOrganizationContexts } from "@/lib/authz/context";
import { Container } from "@/components/ui/container";

export const metadata = { title: "Workspace — CONVORA" };

export default async function AppHomePage() {
  const auth = await requireAuthenticatedUser();
  const memberships = await getUserOrganizationContexts(auth.user.id);
  return (
    <Container className="py-12">
      <h1 className="text-2xl tracking-tight">Workspace</h1>
      <p className="mt-2 max-w-2xl text-sm text-[#5c5c5c]">
        Authenticated as {auth.user.email}. Conversations, channels, and customer tools are not available in Phase 1.
      </p>
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">Organizations</h2>
          <Link href="/app/organization" className="text-sm text-[#1f4e3d] hover:underline">Manage</Link>
        </div>
        {memberships.length === 0 ? (
          <div className="mt-4 border border-[#e4e4e2] bg-white p-6">
            <p className="text-sm text-[#3f3f3f]">You are not a member of any organization yet.</p>
            <Link href="/app/organization" className="mt-4 inline-flex bg-[#1f4e3d] px-4 py-2.5 text-sm text-white hover:bg-[#173b2e]">Create organization</Link>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-[#e4e4e2] border border-[#e4e4e2] bg-white">
            {memberships.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{m.organizationName}</p>
                  <p className="text-[#5c5c5c]">{m.organizationSlug} · {m.role}</p>
                </div>
                <Link href={`/app/organization?org=${m.organizationId}`} className="text-[#1f4e3d] hover:underline">Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Container>
  );
}
