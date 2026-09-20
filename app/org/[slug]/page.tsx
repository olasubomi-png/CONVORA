import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicOrganizationProfileBySlug } from "@/lib/profiles/public";
import { Container } from "@/components/ui/container";
import { VerificationBadge } from "@/components/profiles/verification-badge";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const profile = await getPublicOrganizationProfileBySlug(slug);
  if (!profile) return { title: "Organization — CONVORA" };
  return {
    title: `${profile.displayName} — CONVORA`,
    description: profile.description ?? `${profile.displayName} on CONVORA`,
  };
}

export default async function PublicOrgPage({ params }: Props) {
  const { slug } = await params;
  const profile = await getPublicOrganizationProfileBySlug(slug);
  if (!profile) notFound();

  return (
    <div className="min-h-screen bg-[#f8f8f7]">
      <header className="border-b border-[#e4e4e2] bg-white">
        <Container className="flex h-14 items-center">
          <Link href="/" className="text-sm font-semibold tracking-[0.18em]">
            CONVORA
          </Link>
        </Container>
      </header>

      <main>
        <section className="border-b border-[#e4e4e2] bg-white">
          <Container className="py-12">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl tracking-tight">{profile.displayName}</h1>
              <VerificationBadge status={profile.verificationStatus} />
            </div>
            {profile.description ? (
              <p className="mt-4 max-w-3xl text-base leading-7 text-[#3f3f3f]">
                {profile.description}
              </p>
            ) : null}
            <dl className="mt-8 grid gap-4 text-sm sm:grid-cols-2 md:grid-cols-3">
              {profile.location ? (
                <div>
                  <dt className="text-[#5c5c5c]">Location</dt>
                  <dd>{profile.location}</dd>
                </div>
              ) : null}
              {profile.serviceArea ? (
                <div>
                  <dt className="text-[#5c5c5c]">Service area</dt>
                  <dd>{profile.serviceArea}</dd>
                </div>
              ) : null}
              {profile.websiteUrl ? (
                <div>
                  <dt className="text-[#5c5c5c]">Website</dt>
                  <dd>
                    <a href={profile.websiteUrl} className="text-[#1f4e3d] hover:underline">
                      {profile.websiteUrl}
                    </a>
                  </dd>
                </div>
              ) : null}
              {profile.publicEmail ? (
                <div>
                  <dt className="text-[#5c5c5c]">Email</dt>
                  <dd>{profile.publicEmail}</dd>
                </div>
              ) : null}
              {profile.publicPhone ? (
                <div>
                  <dt className="text-[#5c5c5c]">Phone</dt>
                  <dd>{profile.publicPhone}</dd>
                </div>
              ) : null}
            </dl>
          </Container>
        </section>

        <section>
          <Container className="py-12">
            <h2 className="text-xl tracking-tight">Agents</h2>
            {profile.agents.length === 0 ? (
              <p className="mt-4 text-sm text-[#5c5c5c]">No public agents yet.</p>
            ) : (
              <ul className="mt-6 grid gap-px bg-[#e4e4e2] sm:grid-cols-2 lg:grid-cols-3">
                {profile.agents.map((agent) => (
                  <li key={agent.username} className="bg-white p-5">
                    <Link href={`/@${agent.username}`} className="block hover:underline">
                      <p className="font-medium">{agent.displayName}</p>
                      {agent.professionalTitle ? (
                        <p className="mt-1 text-sm text-[#5c5c5c]">{agent.professionalTitle}</p>
                      ) : null}
                    </Link>
                    <div className="mt-2">
                      <VerificationBadge status={agent.verificationStatus} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Container>
        </section>
      </main>
    </div>
  );
}
