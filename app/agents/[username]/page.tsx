import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicAgentProfileByUsername } from "@/lib/profiles/public";
import { Container } from "@/components/ui/container";
import { VerificationBadge } from "@/components/profiles/verification-badge";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  const profile = await getPublicAgentProfileByUsername(username);
  if (!profile) return { title: "Profile — CONVORA" };
  return {
    title: `${profile.displayName} — CONVORA`,
    description: profile.bio ?? `${profile.displayName} on CONVORA`,
  };
}

export default async function PublicAgentPage({ params }: Props) {
  const { username } = await params;
  const profile = await getPublicAgentProfileByUsername(username);
  if (!profile) notFound();

  return (
    <div className="min-h-screen bg-[#f8f8f7]">
      <header className="border-b border-[#e4e4e2] bg-white">
        <Container className="flex h-14 items-center justify-between">
          <Link href="/" className="text-sm font-semibold tracking-[0.18em]">
            CONVORA
          </Link>
          <Link
            href={`/org/${profile.organization.slug}`}
            className="text-sm text-[#3f3f3f] hover:text-[#141414]"
          >
            {profile.organization.displayName}
          </Link>
        </Container>
      </header>

      <main>
        <section className="border-b border-[#e4e4e2] bg-white">
          <Container className="grid gap-8 py-12 md:grid-cols-12">
            <div className="md:col-span-8">
              <div className="flex items-start gap-5">
                <div
                  className="flex h-20 w-20 shrink-0 items-center justify-center border border-[#e4e4e2] bg-[#f3f3f1] text-2xl font-medium text-[#5c5c5c]"
                  aria-hidden
                >
                  {profile.displayName.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-3xl tracking-tight">{profile.displayName}</h1>
                    <VerificationBadge status={profile.verificationStatus} />
                  </div>
                  {profile.professionalTitle ? (
                    <p className="mt-1 text-[#3f3f3f]">{profile.professionalTitle}</p>
                  ) : null}
                  <p className="mt-2 text-sm text-[#5c5c5c]">@{profile.username}</p>
                </div>
              </div>

              {profile.bio ? (
                <p className="mt-8 max-w-2xl text-base leading-7 text-[#3f3f3f]">
                  {profile.bio}
                </p>
              ) : null}

              <dl className="mt-8 grid gap-4 text-sm sm:grid-cols-2">
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
                {profile.yearsExperience !== null ? (
                  <div>
                    <dt className="text-[#5c5c5c]">Experience</dt>
                    <dd>{profile.yearsExperience} years</dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <aside className="md:col-span-4">
              <div className="border border-[#e4e4e2] bg-[#f8f8f7] p-6">
                <p className="text-xs tracking-[0.12em] text-[#5c5c5c]">ORGANIZATION</p>
                <Link
                  href={`/org/${profile.organization.slug}`}
                  className="mt-2 block text-lg hover:underline"
                >
                  {profile.organization.displayName}
                </Link>
                <div className="mt-2">
                  <VerificationBadge status={profile.organization.verificationStatus} />
                </div>
                <button
                  type="button"
                  disabled
                  className="mt-6 w-full border border-[#141414] bg-[#141414] px-4 py-2.5 text-sm text-white opacity-60"
                  title="Conversations arrive in a later phase"
                >
                  Start a conversation
                </button>
                <p className="mt-2 text-xs text-[#5c5c5c]">
                  Messaging is not available in Phase 2.
                </p>
              </div>
            </aside>
          </Container>
        </section>

        <section>
          <Container className="py-12">
            <h2 className="text-xl tracking-tight">Activity</h2>
            {profile.posts.length === 0 ? (
              <p className="mt-4 text-sm text-[#5c5c5c]">No public activity yet.</p>
            ) : (
              <ul className="mt-6 space-y-4">
                {profile.posts.map((post) => (
                  <li key={post.id} className="border border-[#e4e4e2] bg-white p-5">
                    <p className="text-sm leading-6 text-[#3f3f3f] whitespace-pre-wrap">
                      {post.body}
                    </p>
                    {post.publishedAt ? (
                      <p className="mt-3 text-xs text-[#5c5c5c]">
                        {new Date(post.publishedAt).toLocaleDateString()}
                      </p>
                    ) : null}
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
