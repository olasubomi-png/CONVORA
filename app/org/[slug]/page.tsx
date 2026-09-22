import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicOrganizationProfileBySlug } from "@/lib/profiles/public";
import { getPublicWebChatEmbedByOrgSlug } from "@/lib/web-chat/public-embed";
import { Container } from "@/components/ui/container";
import { VerificationBadge } from "@/components/profiles/verification-badge";
import { PublicWebChatWidget } from "@/components/web-chat/public-widget";
import { getServerEnv } from "@/lib/env";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicOrganizationProfileBySlug(slug);
  if (!profile) return { title: "Organization — CONVORA" };
  const env = getServerEnv();
  const url = `${env.APP_URL}/org/${profile.slug}`;
  const description =
    profile.description ??
    `${profile.displayName} on CONVORA — message them where you already are.`;
  return {
    title: `${profile.displayName} — CONVORA`,
    description,
    openGraph: {
      title: profile.displayName,
      description,
      url,
      type: "profile",
      ...(profile.logoUrl ? { images: [{ url: profile.logoUrl }] } : {}),
    },
    twitter: {
      card: "summary",
      title: profile.displayName,
      description,
    },
  };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function PublicOrgPage({ params }: Props) {
  const { slug } = await params;
  const [profile, webChat] = await Promise.all([
    getPublicOrganizationProfileBySlug(slug),
    getPublicWebChatEmbedByOrgSlug(slug),
  ]);
  if (!profile) notFound();

  const hasContact =
    Boolean(profile.publicEmail) ||
    Boolean(profile.publicPhone) ||
    Boolean(profile.websiteUrl);

  return (
    <div className="min-h-screen bg-[var(--cv-bg)] pb-24 sm:pb-0">
      <header className="border-b border-[var(--cv-border)] bg-white">
        <Container className="flex h-14 items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-[0.14em]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--cv-accent)] text-xs font-bold text-white">
              C
            </span>
            CONVORA
          </Link>
          <span className="text-xs text-[var(--cv-fg-muted)]">Public profile</span>
        </Container>
      </header>

      <main>
        <section className="border-b border-[var(--cv-border)] bg-white">
          <Container className="py-10 md:py-14">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              {profile.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.logoUrl}
                  alt=""
                  className="h-20 w-20 rounded-2xl border border-[var(--cv-border)] object-cover"
                />
              ) : (
                <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--cv-accent-soft)] text-xl font-semibold text-[var(--cv-accent)]">
                  {initials(profile.displayName)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-[var(--cv-fg)] md:text-3xl">
                    {profile.displayName}
                  </h1>
                  <VerificationBadge status={profile.verificationStatus} />
                </div>
                {profile.description ? (
                  <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--cv-fg-secondary)]">
                    {profile.description}
                  </p>
                ) : null}
                <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--cv-fg-muted)]">
                  {profile.location ? (
                    <div>
                      <dt className="sr-only">Location</dt>
                      <dd>{profile.location}</dd>
                    </div>
                  ) : null}
                  {profile.serviceArea ? (
                    <div>
                      <dt className="sr-only">Service area</dt>
                      <dd>{profile.serviceArea}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </div>
          </Container>
        </section>

        {/* Contact / Web Chat */}
        <section className="border-b border-[var(--cv-border)]">
          <Container className="py-8 md:py-10">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                {webChat ? (
                  <div className="rounded-2xl border border-[var(--cv-border)] bg-white p-5 shadow-[var(--cv-shadow-sm)]">
                    <p className="text-sm font-semibold text-[var(--cv-fg)]">
                      Have a question?
                    </p>
                    <p className="mt-1 text-sm text-[var(--cv-fg-muted)]">
                      Chat directly with {profile.displayName}. You do not need a
                      CONVORA account.
                    </p>
                    <div className="mt-4">
                      <PublicWebChatWidget
                        publicKey={webChat.publicKey}
                        displayName={webChat.displayName}
                        welcomeMessage={webChat.welcomeMessage}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-[var(--cv-border)] bg-white p-5">
                    <p className="text-sm font-semibold text-[var(--cv-fg)]">
                      Contact
                    </p>
                    {hasContact ? (
                      <ul className="mt-3 space-y-2 text-sm text-[var(--cv-fg-secondary)]">
                        {profile.publicEmail ? (
                          <li>
                            <a
                              href={`mailto:${profile.publicEmail}`}
                              className="text-[var(--cv-accent)] hover:underline"
                            >
                              {profile.publicEmail}
                            </a>
                          </li>
                        ) : null}
                        {profile.publicPhone ? (
                          <li>
                            <a
                              href={`tel:${profile.publicPhone}`}
                              className="hover:underline"
                            >
                              {profile.publicPhone}
                            </a>
                          </li>
                        ) : null}
                        {profile.websiteUrl ? (
                          <li>
                            <a
                              href={profile.websiteUrl}
                              className="text-[var(--cv-accent)] hover:underline"
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              Website
                            </a>
                          </li>
                        ) : null}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-[var(--cv-fg-muted)]">
                        This business has not published chat or contact details
                        yet.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {hasContact && webChat ? (
                <aside className="rounded-2xl border border-[var(--cv-border)] bg-white p-5 shadow-[var(--cv-shadow-sm)]">
                  <p className="text-sm font-semibold">Also reachable at</p>
                  <ul className="mt-3 space-y-2 text-sm text-[var(--cv-fg-secondary)]">
                    {profile.publicEmail ? (
                      <li>
                        <a
                          href={`mailto:${profile.publicEmail}`}
                          className="text-[var(--cv-accent)] hover:underline"
                        >
                          {profile.publicEmail}
                        </a>
                      </li>
                    ) : null}
                    {profile.publicPhone ? <li>{profile.publicPhone}</li> : null}
                    {profile.websiteUrl ? (
                      <li>
                        <a
                          href={profile.websiteUrl}
                          className="text-[var(--cv-accent)] hover:underline"
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          Website
                        </a>
                      </li>
                    ) : null}
                  </ul>
                </aside>
              ) : null}
            </div>
          </Container>
        </section>

        <section>
          <Container className="py-10 md:py-12">
            <h2 className="text-lg font-semibold tracking-tight">Team</h2>
            {profile.agents.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--cv-fg-muted)]">
                No public agents yet.
              </p>
            ) : (
              <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {profile.agents.map((agent) => (
                  <li key={agent.username}>
                    <Link
                      href={`/agents/${agent.username}`}
                      className="block rounded-2xl border border-[var(--cv-border)] bg-white p-5 shadow-[var(--cv-shadow-sm)] transition-colors hover:border-[var(--cv-accent)]"
                    >
                      <div className="flex items-center gap-3">
                        {agent.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={agent.avatarUrl}
                            alt=""
                            className="h-11 w-11 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                            {initials(agent.displayName)}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--cv-fg)]">
                            {agent.displayName}
                          </p>
                          {agent.professionalTitle ? (
                            <p className="truncate text-sm text-[var(--cv-fg-muted)]">
                              {agent.professionalTitle}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3">
                        <VerificationBadge status={agent.verificationStatus} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Container>
        </section>
      </main>

      <footer className="border-t border-[var(--cv-border)] bg-white py-6 text-center text-xs text-[var(--cv-fg-muted)]">
        Powered by{" "}
        <Link href="/" className="font-medium text-[var(--cv-fg)] hover:underline">
          CONVORA
        </Link>
      </footer>
    </div>
  );
}
